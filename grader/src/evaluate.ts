import { judgeTest, overallVerdict, type TestVerdict, type Verdict } from "./compare.js";
import { runnerResponseSchema, type Problem } from "./schema.js";

export class ProtocolError extends Error {}

export interface TestOutcome {
  test: number;
  verdict: TestVerdict;
  ms: number;
  stdout: string;
  stderr: string;
}

export interface Evaluation {
  verdict: Verdict;
  passed: number;
  total: number;
  results: TestOutcome[];
}

// Output comes from attacker-controlled code and ends up on a terminal:
// drop control characters (ANSI escapes) and keep it short.
export function sanitize(s: string, max = 300): string {
  return s.replace(/[^\t\n\x20-\x7e -￿]/g, "?").slice(0, max);
}

// Treat the runner's reply as untrusted: parse, validate shape, then compare.
export function evaluate(problem: Problem, rawBody: string): Evaluation {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new ProtocolError("runner returned invalid JSON");
  }
  const parsed = runnerResponseSchema.safeParse(json);
  if (!parsed.success) throw new ProtocolError("runner response failed validation");
  if (parsed.data.length !== problem.tests.length) {
    throw new ProtocolError(`expected ${problem.tests.length} results, got ${parsed.data.length}`);
  }
  const results = problem.tests.map((t, i): TestOutcome => {
    const r = parsed.data[i]!;
    return {
      test: i + 1,
      verdict: judgeTest(t.expected, r),
      ms: r.ms,
      stdout: sanitize(r.stdout),
      stderr: sanitize(r.stderr),
    };
  });
  const verdicts = results.map((r) => r.verdict);
  return {
    verdict: overallVerdict(verdicts),
    passed: verdicts.filter((v) => v === "pass").length,
    total: results.length,
    results,
  };
}
