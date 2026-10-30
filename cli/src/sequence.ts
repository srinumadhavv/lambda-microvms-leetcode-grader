import { writeFile, mkdir } from "node:fs/promises";
import { formatLine, green, red } from "./format.js";
import { SEQUENCE } from "./payloads.js";
import { submitFile, type GradeFn } from "./run.js";

// Runs: correct solution -> every payload -> correct solution again.
// The last line proves the platform is unaffected by everything in between.
export async function runSequence(
  fn: GradeFn,
  problemId = "two-sum",
  pauseMs = 0,
  local = false,
): Promise<boolean> {
  const rows: unknown[] = [];
  let contained = 0;
  for (const step of SEQUENCE) {
    const r = await submitFile(step.file, problemId, fn);
    const ok = step.contained.includes(r.verdict) || (local && (step.localAlso ?? []).includes(r.verdict));
    if (ok) contained++;
    console.log(formatLine(step.file, r, step.reason) + (ok ? green("  ✓") : red("  ✗ UNEXPECTED")));
    rows.push({ file: step.file, expected: step.contained, ok, ...r });
    if (pauseMs) await new Promise((res) => setTimeout(res, pauseMs));
  }
  const allOk = contained === SEQUENCE.length;
  console.log(`\n${allOk ? green("All contained") : red("SOME NOT CONTAINED")}: ${contained}/${SEQUENCE.length}`);
  await mkdir("out", { recursive: true });
  const file = `out/attack-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(file, JSON.stringify(rows, null, 2));
  console.log(`results saved to ${file} (use these numbers on slides)`);
  return allOk;
}
