import { z } from "zod";

export const MAX_CODE_BYTES = 50 * 1024;
export const MAX_RUNNER_RESPONSE_BYTES = 256 * 1024;

// What the (untrusted) runner may send back. Anything else is rejected.
export const runnerResultSchema = z.object({
  status: z.enum(["ok", "error", "timeout", "killed"]),
  stdout: z.string().max(16_384),
  stderr: z.string().max(4_096),
  ms: z.number().finite().nonnegative().max(60_000),
});
export const runnerResponseSchema = z.array(runnerResultSchema).max(20);
export type RunnerResult = z.infer<typeof runnerResultSchema>;

export const problemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  title: z.string(),
  statement: z.string(),
  tests: z.array(z.object({ input: z.string(), expected: z.string() })).min(1).max(20),
});
export type Problem = z.infer<typeof problemSchema>;

export const submitSchema = z.object({
  problemId: z.string().regex(/^[a-z0-9-]{1,40}$/), // no "/" or ".": cannot escape problems/
  code: z.string().max(MAX_CODE_BYTES),
});
