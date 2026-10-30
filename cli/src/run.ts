// Grades a submission locally (AWS credentials) or through the Function URL (--remote).
import { readFile } from "node:fs/promises";
import { grade, type GradeResult } from "../../grader/src/grade.js";

process.env.GRADER_LOG ??= "off"; // keep demo output clean; set GRADER_LOG=on to see JSON logs

export type GradeFn = (code: string, problemId: string) => Promise<GradeResult>;

export const gradeLocalAws: GradeFn = (code, problemId) => grade(code, problemId);

export const gradeRemote: GradeFn = async (code, problemId) => {
  const url = process.env.GRADER_URL;
  const secret = process.env.DEMO_SECRET;
  if (!url || !secret) throw new Error("--remote needs GRADER_URL and DEMO_SECRET in .env");
  const res = await fetch(`${url.replace(/\/$/, "")}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-secret": secret },
    body: JSON.stringify({ problemId, code }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`remote HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as GradeResult;
};

export async function submitFile(file: string, problemId: string, fn: GradeFn): Promise<GradeResult> {
  return fn(await readFile(file, "utf8"), problemId);
}
