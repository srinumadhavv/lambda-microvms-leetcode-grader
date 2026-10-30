// Maps the outcome of one sandboxed run to a status. Pure function: easy to unit-test.
export type Status = "ok" | "error" | "timeout" | "killed";

export interface SpawnOutcome {
  errorCode?: string | undefined; // spawnSync().error?.code, e.g. "ETIMEDOUT"
  signal: string | null; // spawnSync().signal
  exitCode: number | null; // spawnSync().status
}

export function mapStatus(o: SpawnOutcome): Status {
  // Timeout first: spawnSync reports BOTH ETIMEDOUT and signal=SIGKILL for it.
  if (o.errorCode === "ETIMEDOUT") return "timeout";
  if (o.signal !== null || o.errorCode === "ENOBUFS") return "killed";
  if (o.exitCode === 0) return "ok";
  return "error";
}
