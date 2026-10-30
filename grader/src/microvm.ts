import {
  CreateMicrovmAuthTokenCommand,
  LambdaMicrovmsClient,
  ListMicrovmsCommand,
  RunMicrovmCommand,
  TerminateMicrovmCommand,
} from "@aws-sdk/client-lambda-microvms";
import type { Config } from "./config.js";
import { log } from "./log.js";
import { withBackoff } from "./retry.js";
import { MAX_RUNNER_RESPONSE_BYTES } from "./schema.js";

export function makeClient(cfg: Config): LambdaMicrovmsClient {
  return new LambdaMicrovmsClient({ region: cfg.region });
}

export async function launch(client: LambdaMicrovmsClient, cfg: Config) {
  const out = await withBackoff(
    () =>
      client.send(
        new RunMicrovmCommand({
          imageIdentifier: cfg.imageArn,
          maximumDurationInSeconds: 60, // hard cost cap even if we crash before terminate
          ingressNetworkConnectors: cfg.ingress, // so the grader can call it
          egressNetworkConnectors: cfg.egress, // [] = NO outbound access (VERIFY with exfil.py)
          // no executionRoleArn: the VM gets no AWS credentials at all
        }),
      ),
    { onRetry: (attempt, delayMs) => log("run-microvm-throttled", { attempt, delayMs }) },
  );
  if (!out.microvmId || !out.endpoint) throw new Error("run-microvm returned no id/endpoint");
  return { microvmId: out.microvmId, endpoint: out.endpoint };
}

export async function tokenFor(client: LambdaMicrovmsClient, microvmId: string): Promise<string> {
  const out = await withBackoff(() =>
    client.send(
      new CreateMicrovmAuthTokenCommand({
        microvmIdentifier: microvmId,
        expirationInMinutes: 2,
        allowedPorts: [{ port: 8080 }], // only the runner port
      }),
    ),
  );
  const token = out.authToken?.["X-aws-proxy-auth"];
  if (!token) throw new Error("no X-aws-proxy-auth in auth token response");
  return token;
}

export async function terminate(client: LambdaMicrovmsClient, microvmId: string): Promise<void> {
  await withBackoff(() => client.send(new TerminateMicrovmCommand({ microvmIdentifier: microvmId })));
}

export async function listRunning(client: LambdaMicrovmsClient, cfg: Config) {
  const items: { microvmId: string; state: string; startedAt?: Date }[] = [];
  let nextToken: string | undefined;
  do {
    const out = await client.send(new ListMicrovmsCommand({ imageIdentifier: cfg.imageArn, nextToken }));
    for (const m of out.items ?? []) {
      if (m.state === "PENDING" || m.state === "RUNNING" || m.state === "SUSPENDED") {
        items.push({ microvmId: m.microvmId!, state: m.state, startedAt: m.startedAt });
      }
    }
    nextToken = out.nextToken;
  } while (nextToken);
  return items;
}

// Reads at most `max` bytes, so a hostile VM cannot make us buffer gigabytes.
export async function readCapped(res: Response, max = MAX_RUNNER_RESPONSE_BYTES): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new Error(`runner response exceeds ${max} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function baseUrl(endpoint: string): string {
  return /^https?:\/\//.test(endpoint) ? endpoint.replace(/\/$/, "") : `https://${endpoint}`;
}

// POST /grade. Traffic only starts after the `run` hook returns, so early attempts may
// fail to connect or get 5xx: retry briefly until the overall deadline.
export async function postGrade(
  endpoint: string,
  token: string,
  body: unknown,
  timeoutMs = 30_000,
  headers: Record<string, string> = {},
): Promise<string> {
  const signal = AbortSignal.timeout(timeoutMs);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(`${baseUrl(endpoint)}/grade`, {
        method: "POST",
        headers: { "content-type": "application/json", "X-aws-proxy-auth": token, ...headers },
        body: JSON.stringify(body),
        signal,
      });
      if (res.status >= 502 && res.status <= 504) {
        lastErr = new Error(`runner not ready (HTTP ${res.status})`);
      } else if (!res.ok) {
        throw new Error(`runner HTTP ${res.status}: ${(await readCapped(res, 2048)).slice(0, 200)}`);
      } else {
        return await readCapped(res);
      }
    } catch (err) {
      if (signal.aborted) throw err;
      if ((err as Error).message.startsWith("runner")) throw err;
      lastErr = err; // network error: VM still starting
    }
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  throw lastErr instanceof Error ? lastErr : new Error("runner unreachable");
}
