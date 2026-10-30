import { formatLine } from "./format.js";
import { gradeLocalAws, gradeRemote, submitFile } from "./run.js";

// npm run submit -- <file> [--problem two-sum] [--remote]
const args = process.argv.slice(2);
const remote = args.includes("--remote");
const pi = args.indexOf("--problem");
const problem = pi >= 0 ? (args[pi + 1] ?? "two-sum") : "two-sum";
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--problem");

if (!file) {
  console.error("usage: npm run submit -- <file> [--problem two-sum] [--remote]");
  process.exit(2);
}

try {
  const r = await submitFile(file, problem, remote ? gradeRemote : gradeLocalAws);
  console.log(formatLine(file, r, ""));
  for (const t of r.results) console.log(`    test ${t.test}: ${t.verdict.padEnd(8)} ${t.ms} ms`);
} catch (err) {
  console.error(`submit failed: ${(err as Error).message}`);
  process.exit(1);
}
