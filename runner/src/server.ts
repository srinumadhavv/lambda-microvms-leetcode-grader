import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { gradeAll, runOne, setHashSeed, writeSolution } from "./sandbox.js";
import { MAX_BODY_BYTES, parseGradeRequest } from "./request.js";

const PORT = Number(process.env.PORT ?? 8080);
const HOOK_PREFIX = "/aws/lambda-microvms/runtime/v1/";
const HOOKS = new Set(["run", "resume", "suspend", "terminate", "ready", "validate"]);

// The VM is restored from a snapshot, so anything random created at build time
// is identical in every VM. We re-seed in the `run` hook.
function reseed(): string {
  const seed = String(randomBytes(4).readUInt32BE(0));
  setHashSeed(seed);
  return seed;
}
reseed();

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

// Reads the body but gives up as soon as it passes the size limit.
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}

// A VM restored from a snapshot has a cold disk: the first python start can take > 2 s and
// would trip the per-test timeout. Run the real sandbox path once BEFORE traffic starts
// (the run hook blocks traffic until it returns), so python, its stdlib and the tools are loaded.
function warmUp(): void {
  const file = writeSolution("import urllib.request, socket, json, os, threading, select\n");
  runOne(file, "");
}

async function handleHook(hook: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = (await readBody(req)) ?? "";
  if (hook === "run" || hook === "ready") warmUp();
  if (hook === "run") {
    let microvmId = "unknown";
    try {
      microvmId = JSON.parse(raw).microvmId ?? microvmId;
    } catch {
      /* hook body is optional */
    }
    reseed();
    console.log(JSON.stringify({ event: "run-hook", microvmId }));
  }
  send(res, 200, { ok: true });
}

async function handleGrade(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  if (raw === null) return send(res, 413, { error: "body too large" });
  const parsed = parseGradeRequest(raw);
  if (!parsed.ok) return send(res, parsed.status, { error: parsed.error });
  send(res, 200, gradeAll(parsed.code, parsed.inputs));
}

const server = createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0] ?? "";
  if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true });
  if (path.startsWith(HOOK_PREFIX)) {
    const hook = path.slice(HOOK_PREFIX.length);
    if (HOOKS.has(hook)) return void handleHook(hook, req, res);
  }
  if (req.method === "POST" && path === "/grade") return void handleGrade(req, res);
  send(res, 404, { error: "not found" });
});

server.listen(PORT, () => console.log(JSON.stringify({ event: "listening", port: PORT })));
