import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { problemSchema, type Problem } from "./schema.js";

function problemsDir(): string {
  if (process.env.PROBLEMS_DIR) return process.env.PROBLEMS_DIR;
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../problems");
}

export async function loadProblem(id: string): Promise<Problem> {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new Error("invalid problem id");
  const raw = await readFile(join(problemsDir(), id, "problem.json"), "utf8");
  return problemSchema.parse(JSON.parse(raw));
}
