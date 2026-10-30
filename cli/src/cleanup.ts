import { createInterface } from "node:readline/promises";
import { listRunning, makeClient, terminate } from "../../grader/src/microvm.js";
import { loadConfig } from "../../grader/src/config.js";

const cfg = loadConfig();
const client = makeClient(cfg);
const vms = await listRunning(client, cfg);

if (vms.length === 0) {
  console.log("no running MicroVMs from the grader image");
  process.exit(0);
}
for (const v of vms) console.log(`${v.microvmId}  ${v.state}  ${v.startedAt?.toISOString() ?? ""}`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(`terminate ${vms.length} MicroVM(s)? [y/N] `);
rl.close();
if (answer.trim().toLowerCase() !== "y") process.exit(0);

for (const v of vms) {
  await terminate(client, v.microvmId);
  console.log(`terminated ${v.microvmId}`);
}
