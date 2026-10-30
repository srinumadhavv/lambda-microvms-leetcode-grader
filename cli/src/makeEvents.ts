// Writes one Lambda console test event per demo file into out/events/ (no AWS calls).
// Paste a file's contents into Lambda console → Test → Event JSON.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { SEQUENCE } from "./payloads.js";

const secret = process.env.DEMO_SECRET ?? "<DEMO_SECRET>";
await mkdir("out/events", { recursive: true });

const files = [...new Set([...SEQUENCE.map((s) => s.file), "solutions/wrong.py"])];
for (const file of files) {
  const code = await readFile(file, "utf8");
  const event = {
    requestContext: { http: { method: "POST" } },
    rawPath: "/submit",
    headers: { "x-demo-secret": secret },
    body: JSON.stringify({ problemId: "two-sum", code }),
  };
  const out = `out/events/${basename(file, ".py")}.json`;
  await writeFile(out, JSON.stringify(event, null, 2));
  console.log(out);
}
