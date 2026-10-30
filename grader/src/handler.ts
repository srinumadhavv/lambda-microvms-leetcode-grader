// Lambda handler for a Function URL: POST /submit {problemId, code} -> verdict JSON.
// Demo-grade auth: shared secret in the x-demo-secret header (env DEMO_SECRET).
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildCatalog, uiDir } from "./catalog.js";
import { grade } from "./grade.js";
import { log } from "./log.js";
import { submitSchema } from "./schema.js";

interface UrlEvent {
  rawPath?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
}

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

function secretOk(given: string | undefined): boolean {
  const want = process.env.DEMO_SECRET ?? "";
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handler(event: UrlEvent) {
  const method = event.requestContext?.http?.method;
  // Demo UI: static page + read-only catalog (no secret needed; no expected answers inside).
  if (method === "GET" && (event.rawPath === "/" || event.rawPath === "")) {
    const html = await readFile(join(uiDir(), "index.html"), "utf8");
    return { statusCode: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }, body: html };
  }
  if (method === "GET" && event.rawPath === "/api/catalog") return json(200, await buildCatalog());
  if (method !== "POST" || event.rawPath !== "/submit") {
    return json(404, { error: "GET / or POST /submit only" });
  }
  if (!secretOk(event.headers?.["x-demo-secret"])) return json(401, { error: "unauthorized" });

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString() : (event.body ?? "");
  let parsed;
  try {
    parsed = submitSchema.safeParse(JSON.parse(rawBody));
  } catch {
    return json(400, { error: "invalid JSON" });
  }
  if (!parsed.success) return json(400, { error: "invalid request" });

  try {
    const result = await grade(parsed.data.code, parsed.data.problemId);
    log("verdict", {
      microvmId: result.microvmId,
      problemId: parsed.data.problemId,
      verdict: result.verdict,
      timings: result.timings,
    });
    return json(200, result);
  } catch (err) {
    log("grade-failed", { problemId: parsed.data.problemId, error: String(err) });
    // Demo-grade: the caller already proved the shared secret, so show the real reason on screen.
    return json(502, { error: "grading failed", detail: String(err).slice(0, 600) });
  }
}
