// Structured JSON logs (CloudWatch-friendly). Goes to stderr so CLI output stays clean.
// Set GRADER_LOG=off to silence (the CLI does this by default).
export function log(event: string, fields: Record<string, unknown> = {}): void {
  if (process.env.GRADER_LOG === "off") return;
  console.error(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}
