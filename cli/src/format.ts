// Shared terminal formatting for the demo lines.
import type { GradeResult } from "../../grader/src/grade.js";

const tty = process.stdout.isTTY === true;
const paint = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const green = paint(32);
export const red = paint(31);
export const yellow = paint(33);
export const dim = paint(2);

const n = (x: number) => x.toLocaleString("en-US");

export function colorVerdict(verdict: string): string {
  const padded = verdict.padEnd(13);
  if (verdict === "ACCEPTED") return green(padded);
  if (verdict === "WRONG_ANSWER") return yellow(padded);
  return red(padded);
}

// $ submit payloads/fork_bomb.py   → KILLED   nproc cap   (vm mvm-…, launch 412 ms, grade 2,050 ms)
export function formatLine(file: string, r: GradeResult, reason: string): string {
  const note = reason || `${r.passed}/${r.total} tests`;
  return (
    `$ submit ${file.padEnd(28)} → ${colorVerdict(r.verdict)} ${note.padEnd(18)} ` +
    dim(`(vm ${r.microvmId}, launch ${n(r.timings.launchMs)} ms, grade ${n(r.timings.gradeMs)} ms)`)
  );
}
