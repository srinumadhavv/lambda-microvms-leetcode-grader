import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { mapStatus, type Status } from "./status.js";

export const SANDBOX_DIR = process.env.SANDBOX_DIR ?? "/sandbox";
const SANDBOX_UID = 1001;
const SANDBOX_GID = 1001;
const STDERR_MAX = 2048;
const STDOUT_MAX = 8192;

export interface TestResult {
  status: Status;
  stdout: string;
  stderr: string;
  ms: number;
}

// Per-VM value, set by the `run` hook (see server.ts).
let hashSeed = "0";
export function setHashSeed(seed: string): void {
  hashSeed = seed;
}

export function writeSolution(code: string): string {
  const file = join(SANDBOX_DIR, "sol.py");
  // Written by root (the runner), readable but not writable by uid 1001.
  writeFileSync(file, code, { mode: 0o644 });
  return file;
}

export function runOne(file: string, input: string): TestResult {
  const started = performance.now();
  // The platform attaches INTERNET_EGRESS even when asked for none, so the network is cut here:
  // `unshare --net` gives the child an empty network namespace (no interfaces, not even lo).
  // unshare needs root, so we do NOT use spawn's uid option; setpriv drops to uid 1001 afterwards.
  // Every step exec()s the next, so it stays one process and the timeout/SIGKILL still hits it.
  const r = spawnSync(
    "unshare",
    [
      "--net", "--",
      "setpriv", `--reuid=${SANDBOX_UID}`, `--regid=${SANDBOX_GID}`, "--clear-groups", "--",
      "prlimit", "--nproc=64", "--as=536870912", "--",
      "python3", file,
    ],
    {
      input,
      timeout: 2000,
      killSignal: "SIGKILL",
      maxBuffer: 1_048_576,
      cwd: SANDBOX_DIR,
      // Minimal env: the child must not inherit anything from the runner.
      env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent", PYTHONHASHSEED: hashSeed },
    },
  );
  const errorCode = (r.error as NodeJS.ErrnoException | undefined)?.code;
  return {
    status: mapStatus({ errorCode, signal: r.signal, exitCode: r.status }),
    stdout: (r.stdout?.toString("utf8") ?? "").slice(0, STDOUT_MAX),
    stderr: (r.stderr?.toString("utf8") ?? "").slice(0, STDERR_MAX),
    ms: Math.round(performance.now() - started),
  };
}

export function gradeAll(code: string, inputs: string[]): TestResult[] {
  const file = writeSolution(code);
  return inputs.map((input) => runOne(file, input));
}
