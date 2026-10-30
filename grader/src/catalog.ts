// Read-only data for the demo UI: problem statements + sample submissions (correct, wrong, attacks).
// Expected answers are NOT included: they never leave the trusted side.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProblem } from "./problems.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const samplesDir = () => process.env.SAMPLES_DIR ?? repoRoot;
const problemsDir = () => process.env.PROBLEMS_DIR ?? join(repoRoot, "problems");
export const uiDir = () => process.env.UI_DIR ?? join(repoRoot, "grader/ui");

interface SampleDef {
  id: string;
  group: "Solutions" | "Attacks";
  label: string;
  file: string;
  expect: string;
  note: string;
}

const SAMPLES: SampleDef[] = [
  { id: "two_sum", group: "Solutions", label: "Correct: hash map O(n)", file: "solutions/two_sum.py", expect: "ACCEPTED", note: "A correct solution. All 5 tests pass." },
  { id: "wrong", group: "Solutions", label: "Wrong: ignores zero and negatives", file: "solutions/wrong.py", expect: "WRONG_ANSWER", note: "Runs fine but fails tests 4 and 5 (negatives and zeros)." },
  { id: "infinite_loop", group: "Attacks", label: "Infinite loop", file: "payloads/infinite_loop.py", expect: "TIMEOUT", note: "Burns CPU forever. Stopped by the 2 s timeout + SIGKILL." },
  { id: "fork_bomb", group: "Attacks", label: "Fork bomb", file: "payloads/fork_bomb.py", expect: "ERROR", note: "Forks until refused. Stopped by prlimit --nproc=64." },
  { id: "memory_bomb", group: "Attacks", label: "Memory bomb (100 GB)", file: "payloads/memory_bomb.py", expect: "ERROR", note: "Asks for 100 GB. Stopped by the 512 MB address-space limit." },
  { id: "rm_rf", group: "Attacks", label: "rm -rf system directories", file: "payloads/rm_rf.py", expect: "ERROR", note: "Tries to delete /app /usr /etc /bin. Runs as uid 1001 on root-owned files: permission denied." },
  { id: "exfil", group: "Attacks", label: "Network exfiltration", file: "payloads/exfil.py", expect: "ERROR", note: "Tries HTTPS to example.com. The sandbox has an empty network namespace." },
  { id: "read_answers", group: "Attacks", label: "Steal the expected answers", file: "payloads/read_answers.py", expect: "WRONG_ANSWER", note: "Searches the disk for answers. Finds nothing: answers never enter the VM." },
  { id: "kill_runner", group: "Attacks", label: "Kill the runner and PID 1", file: "payloads/kill_runner.py", expect: "ERROR", note: "Tries to SIGKILL the runner. Different user: operation not permitted." },
];

export async function buildCatalog() {
  const ids = (await readdir(problemsDir(), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  const problems = await Promise.all(
    ids.map(async (id) => {
      const p = await loadProblem(id);
      return { id: p.id, title: p.title, statement: p.statement, inputs: p.tests.map((t) => t.input.trim()) };
    }),
  );
  const root = samplesDir();
  const samples = await Promise.all(
    SAMPLES.map(async ({ file, ...s }) => ({ ...s, code: await readFile(join(root, file), "utf8") })),
  );
  return { problems, samples };
}
