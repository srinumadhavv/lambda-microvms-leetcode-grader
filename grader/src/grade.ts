import type { Config } from "./config.js";
import { evaluate, type Evaluation } from "./evaluate.js";
import { log } from "./log.js";
import { launch, makeClient, postGrade, terminate, tokenFor } from "./microvm.js";
import { loadProblem } from "./problems.js";
import { loadConfig } from "./config.js";

export interface Timings {
  launchMs: number;
  tokenMs: number;
  gradeMs: number;
  terminateMs: number;
}

export interface GradeResult extends Evaluation {
  microvmId: string;
  timings: Timings;
}

const since = (t0: number) => Math.round(performance.now() - t0);

export async function grade(code: string, problemId: string, cfg: Config = loadConfig()): Promise<GradeResult> {
  const problem = await loadProblem(problemId);
  const client = makeClient(cfg);
  const timings: Timings = { launchMs: 0, tokenMs: 0, gradeMs: 0, terminateMs: 0 };
  let microvmId = "none";

  let t = performance.now();
  const vm = await launch(client, cfg);
  microvmId = vm.microvmId;
  timings.launchMs = since(t);

  try {
    t = performance.now();
    const token = await tokenFor(client, microvmId);
    timings.tokenMs = since(t);

    t = performance.now();
    // Code + inputs only. Expected answers stay on this side.
    const raw = await postGrade(vm.endpoint, token, {
      language: "python",
      code,
      inputs: problem.tests.map((x) => x.input),
    });
    const evaluation = evaluate(problem, raw);
    timings.gradeMs = since(t);

    const result: GradeResult = { microvmId, timings, ...evaluation };
    return result;
  } finally {
    // Always terminate, even on errors, so nothing keeps billing.
    t = performance.now();
    try {
      await terminate(client, microvmId);
    } catch (err) {
      log("terminate-failed", { microvmId, error: String(err) });
    }
    timings.terminateMs = since(t);
    log("graded", { microvmId, problemId, timings });
  }
}
