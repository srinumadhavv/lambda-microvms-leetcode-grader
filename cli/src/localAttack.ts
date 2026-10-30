// Same attack sequence, but against the runner in local Docker (no MicroVMs, no AWS).
// Functional check only: local Docker is NOT the isolation boundary, and it HAS internet,
// so payloads/exfil.py is expected to differ here.
import { evaluate } from "../../grader/src/evaluate.js";
import { postGrade } from "../../grader/src/microvm.js";
import { loadProblem } from "../../grader/src/problems.js";
import type { GradeResult } from "../../grader/src/grade.js";
import { runSequence } from "./sequence.js";
import type { GradeFn } from "./run.js";

const URL_ = process.env.LOCAL_RUNNER_URL ?? "http://localhost:8080";

const gradeLocalRunner: GradeFn = async (code, problemId) => {
  const problem = await loadProblem(problemId);
  const t = performance.now();
  const raw = await postGrade(URL_, "local", {
    language: "python",
    code,
    inputs: problem.tests.map((x) => x.input),
  });
  const evaluation = evaluate(problem, raw);
  const gradeMs = Math.round(performance.now() - t);
  return { microvmId: "local-docker", timings: { launchMs: 0, tokenMs: 0, gradeMs, terminateMs: 0 }, ...evaluation } satisfies GradeResult;
};

const ok = await runSequence(gradeLocalRunner, "two-sum", 0, true);
process.exit(ok ? 0 : 1);
