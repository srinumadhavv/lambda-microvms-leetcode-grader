import { readFile } from "node:fs/promises";
import { grade } from "../../grader/src/grade.js";
process.env.GRADER_LOG = "off";
const r = await grade(await readFile(process.argv[2]!, "utf8"), "two-sum");
console.log(r.microvmId, r.verdict);
for (const t of r.results) console.log(t.test, t.verdict, JSON.stringify(t.stderr));
