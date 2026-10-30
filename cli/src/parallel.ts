import { formatLine } from "./format.js";
import { gradeLocalAws, submitFile } from "./run.js";

// Two submissions at once -> two different MicroVMs.
const files = ["solutions/two_sum.py", "solutions/wrong.py"];
const results = await Promise.all(files.map((f) => submitFile(f, "two-sum", gradeLocalAws)));
results.forEach((r, i) => console.log(formatLine(files[i]!, r, "")));
const [a, b] = results;
console.log(`\nVM A: ${a!.microvmId}\nVM B: ${b!.microvmId}`);
console.log(a!.microvmId !== b!.microvmId ? "two separate MicroVMs" : "SAME VM?!");
