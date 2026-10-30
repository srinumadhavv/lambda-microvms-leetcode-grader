"use strict";

// runner/src/server.ts
var import_node_http = require("node:http");
var import_node_crypto = require("node:crypto");

// runner/src/sandbox.ts
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// runner/src/status.ts
function mapStatus(o) {
  if (o.errorCode === "ETIMEDOUT") return "timeout";
  if (o.signal !== null || o.errorCode === "ENOBUFS") return "killed";
  if (o.exitCode === 0) return "ok";
  return "error";
}

// runner/src/sandbox.ts
var SANDBOX_DIR = process.env.SANDBOX_DIR ?? "/sandbox";
var SANDBOX_UID = 1001;
var SANDBOX_GID = 1001;
var STDERR_MAX = 2048;
var STDOUT_MAX = 8192;
var hashSeed = "0";
function setHashSeed(seed) {
  hashSeed = seed;
}
function writeSolution(code) {
  const file = (0, import_node_path.join)(SANDBOX_DIR, "sol.py");
  (0, import_node_fs.writeFileSync)(file, code, { mode: 420 });
  return file;
}
function runOne(file, input) {
  const started = performance.now();
  const r = (0, import_node_child_process.spawnSync)(
    "unshare",
    [
      "--net",
      "--",
      "setpriv",
      `--reuid=${SANDBOX_UID}`,
      `--regid=${SANDBOX_GID}`,
      "--clear-groups",
      "--",
      "prlimit",
      "--nproc=64",
      "--as=536870912",
      "--",
      "python3",
      file
    ],
    {
      input,
      timeout: 2e3,
      killSignal: "SIGKILL",
      maxBuffer: 1048576,
      cwd: SANDBOX_DIR,
      // Minimal env: the child must not inherit anything from the runner.
      env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent", PYTHONHASHSEED: hashSeed }
    }
  );
  const errorCode = r.error?.code;
  return {
    status: mapStatus({ errorCode, signal: r.signal, exitCode: r.status }),
    stdout: (r.stdout?.toString("utf8") ?? "").slice(0, STDOUT_MAX),
    stderr: (r.stderr?.toString("utf8") ?? "").slice(0, STDERR_MAX),
    ms: Math.round(performance.now() - started)
  };
}
function gradeAll(code, inputs) {
  const file = writeSolution(code);
  return inputs.map((input) => runOne(file, input));
}

// runner/src/request.ts
var MAX_BODY_BYTES = 100 * 1024;
var MAX_CODE_BYTES = 50 * 1024;
var MAX_INPUTS = 20;
function parseGradeRequest(raw) {
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return bad(413, "body too large");
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return bad(400, "invalid JSON");
  }
  if (typeof body !== "object" || body === null) return bad(400, "body must be an object");
  const { language, code, inputs } = body;
  if (language !== "python") return bad(400, 'language must be "python"');
  if (typeof code !== "string") return bad(400, "code must be a string");
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) return bad(413, "code too large");
  if (!Array.isArray(inputs) || !inputs.every((i) => typeof i === "string")) {
    return bad(400, "inputs must be string[]");
  }
  if (inputs.length > MAX_INPUTS) return bad(400, "too many inputs");
  return { ok: true, code, inputs };
}
function bad(status, error) {
  return { ok: false, status, error };
}

// runner/src/server.ts
var PORT = Number(process.env.PORT ?? 8080);
var HOOK_PREFIX = "/aws/lambda-microvms/runtime/v1/";
var HOOKS = /* @__PURE__ */ new Set(["run", "resume", "suspend", "terminate", "ready", "validate"]);
function reseed() {
  const seed = String((0, import_node_crypto.randomBytes)(4).readUInt32BE(0));
  setHashSeed(seed);
  return seed;
}
reseed();
function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
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
function warmUp() {
  const file = writeSolution("import urllib.request, socket, json, os, threading, select\n");
  runOne(file, "");
}
async function handleHook(hook, req, res) {
  const raw = await readBody(req) ?? "";
  if (hook === "run" || hook === "ready") warmUp();
  if (hook === "run") {
    let microvmId = "unknown";
    try {
      microvmId = JSON.parse(raw).microvmId ?? microvmId;
    } catch {
    }
    reseed();
    console.log(JSON.stringify({ event: "run-hook", microvmId }));
  }
  send(res, 200, { ok: true });
}
async function handleGrade(req, res) {
  const raw = await readBody(req);
  if (raw === null) return send(res, 413, { error: "body too large" });
  const parsed = parseGradeRequest(raw);
  if (!parsed.ok) return send(res, parsed.status, { error: parsed.error });
  send(res, 200, gradeAll(parsed.code, parsed.inputs));
}
var server = (0, import_node_http.createServer)((req, res) => {
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
