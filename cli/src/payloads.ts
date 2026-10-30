// The attack script: what each payload is, why it fails, and which verdicts count as "contained".
export interface Step {
  file: string;
  reason: string; // short label shown on the demo line
  contained: string[]; // verdicts that prove the defence worked
  localAlso?: string[]; // extra verdicts accepted ONLY in local Docker (it has internet)
}

export const CORRECT: Step = { file: "solutions/two_sum.py", reason: "", contained: ["ACCEPTED"] };

export const PAYLOADS: Step[] = [
  { file: "payloads/infinite_loop.py", reason: "2 s timeout", contained: ["TIMEOUT"] },
  { file: "payloads/fork_bomb.py", reason: "nproc cap", contained: ["KILLED", "ERROR"] },
  { file: "payloads/memory_bomb.py", reason: "memory cap", contained: ["KILLED", "ERROR"] },
  { file: "payloads/rm_rf.py", reason: "permission denied", contained: ["ERROR"] },
  { file: "payloads/exfil.py", reason: "no egress", contained: ["ERROR"], localAlso: ["WRONG_ANSWER"] },
  // Prints "FOUND NOTHING", which is simply a wrong answer for two-sum.
  { file: "payloads/read_answers.py", reason: "no answers in VM", contained: ["WRONG_ANSWER"] },
  { file: "payloads/kill_runner.py", reason: "different user", contained: ["ERROR"] },
];

export const SEQUENCE: Step[] = [CORRECT, ...PAYLOADS, CORRECT];
