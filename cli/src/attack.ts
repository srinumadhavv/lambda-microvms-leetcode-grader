import { runSequence } from "./sequence.js";
import { gradeLocalAws } from "./run.js";

// PAUSE_MS slows the output down for screen recordings, e.g. PAUSE_MS=800 npm run attack
const ok = await runSequence(gradeLocalAws, "two-sum", Number(process.env.PAUSE_MS ?? 0));
process.exit(ok ? 0 : 1);
