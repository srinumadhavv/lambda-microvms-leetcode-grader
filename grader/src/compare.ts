import type { RunnerResult } from "./schema.js";

export type TestVerdict = "pass" | "wrong" | "timeout" | "killed" | "error";
export type Verdict = "ACCEPTED" | "WRONG_ANSWER" | "TIMEOUT" | "KILLED" | "ERROR";

// The comparison happens HERE, in the trusted grader. Expected answers never enter the VM.
export function judgeTest(expected: string, r: RunnerResult): TestVerdict {
  if (r.status !== "ok") return r.status;
  return r.stdout.trim() === expected.trim() ? "pass" : "wrong";
}

// One verdict per submission: the most severe runtime problem wins.
export function overallVerdict(tests: TestVerdict[]): Verdict {
  if (tests.includes("timeout")) return "TIMEOUT";
  if (tests.includes("killed")) return "KILLED";
  if (tests.includes("error")) return "ERROR";
  if (tests.includes("wrong")) return "WRONG_ANSWER";
  return "ACCEPTED";
}
