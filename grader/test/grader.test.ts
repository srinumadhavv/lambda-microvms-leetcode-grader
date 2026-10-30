import { describe, expect, it } from "vitest";
import { mapStatus } from "../../runner/src/status.js";
import { parseGradeRequest } from "../../runner/src/request.js";
import { judgeTest, overallVerdict } from "../src/compare.js";
import { evaluate, ProtocolError, sanitize } from "../src/evaluate.js";
import { isThrottling, withBackoff } from "../src/retry.js";
import type { Problem } from "../src/schema.js";

const problem: Problem = {
  id: "t",
  title: "t",
  statement: "t",
  tests: [
    { input: "a", expected: "[0,1]" },
    { input: "b", expected: "[1,2]" },
  ],
};
const ok = (stdout: string) => ({ status: "ok" as const, stdout, stderr: "", ms: 5 });

describe("status mapping", () => {
  it("timeout wins over killed", () => {
    expect(mapStatus({ errorCode: "ETIMEDOUT", signal: "SIGKILL", exitCode: null })).toBe("timeout");
  });
  it("signal => killed", () => {
    expect(mapStatus({ signal: "SIGSEGV", exitCode: null })).toBe("killed");
  });
  it("exit 0 => ok, non-zero => error", () => {
    expect(mapStatus({ signal: null, exitCode: 0 })).toBe("ok");
    expect(mapStatus({ signal: null, exitCode: 1 })).toBe("error");
  });
  it("output overflow => killed", () => {
    expect(mapStatus({ errorCode: "ENOBUFS", signal: "SIGKILL", exitCode: null })).toBe("killed");
  });
});

describe("comparison", () => {
  it("trims whitespace", () => {
    expect(judgeTest("[0,1]", ok("[0,1]\n"))).toBe("pass");
    expect(judgeTest("[0,1]", ok("[1,0]"))).toBe("wrong");
  });
  it("non-ok status is passed through", () => {
    expect(judgeTest("[0,1]", { ...ok("[0,1]"), status: "timeout" })).toBe("timeout");
  });
  it("overall verdict severity", () => {
    expect(overallVerdict(["pass", "pass"])).toBe("ACCEPTED");
    expect(overallVerdict(["pass", "wrong"])).toBe("WRONG_ANSWER");
    expect(overallVerdict(["wrong", "error"])).toBe("ERROR");
    expect(overallVerdict(["killed", "timeout"])).toBe("TIMEOUT");
  });
});

describe("runner response validation", () => {
  it("accepts a good response and counts passes", () => {
    const e = evaluate(problem, JSON.stringify([ok("[0,1]\n"), ok("[9,9]")]));
    expect(e.passed).toBe(1);
    expect(e.verdict).toBe("WRONG_ANSWER");
  });
  it("rejects bad JSON, wrong shape, wrong length, unknown status", () => {
    expect(() => evaluate(problem, "nope")).toThrow(ProtocolError);
    expect(() => evaluate(problem, JSON.stringify({ a: 1 }))).toThrow(ProtocolError);
    expect(() => evaluate(problem, JSON.stringify([ok("x")]))).toThrow(ProtocolError);
    expect(() => evaluate(problem, JSON.stringify([ok("x"), { ...ok("x"), status: "hacked" }]))).toThrow(ProtocolError);
  });
  it("rejects oversized fields", () => {
    expect(() => evaluate(problem, JSON.stringify([ok("x".repeat(20_000)), ok("y")]))).toThrow(ProtocolError);
  });
  it("strips terminal escape codes", () => {
    expect(sanitize("\x1b[31mred\x1b[0m")).not.toContain("\x1b");
  });
});

describe("runner request validation", () => {
  const body = (o: object) => JSON.stringify({ language: "python", code: "print(1)", inputs: ["x"], ...o });
  it("accepts valid", () => expect(parseGradeRequest(body({})).ok).toBe(true));
  it("rejects limits", () => {
    expect(parseGradeRequest("x".repeat(100 * 1024 + 1))).toMatchObject({ ok: false, status: 413 });
    expect(parseGradeRequest(body({ code: "x".repeat(50 * 1024 + 1) }))).toMatchObject({ ok: false, status: 413 });
    expect(parseGradeRequest(body({ inputs: Array(21).fill("x") }))).toMatchObject({ ok: false, status: 400 });
    expect(parseGradeRequest(body({ language: "ruby" }))).toMatchObject({ ok: false });
    expect(parseGradeRequest("{")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("backoff", () => {
  it("retries throttling then succeeds", async () => {
    let n = 0;
    const delays: number[] = [];
    const r = await withBackoff(
      async () => {
        if (++n < 3) throw Object.assign(new Error("t"), { name: "ThrottlingException" });
        return "done";
      },
      { sleep: async (ms) => void delays.push(ms), random: () => 0.5 },
    );
    expect(r).toBe("done");
    expect(delays).toEqual([100, 200]);
  });
  it("does not retry other errors", async () => {
    let n = 0;
    await expect(withBackoff(async () => { n++; throw new Error("x"); }, { sleep: async () => {} })).rejects.toThrow("x");
    expect(n).toBe(1);
    expect(isThrottling({ name: "ThrottlingException" })).toBe(true);
  });
});
