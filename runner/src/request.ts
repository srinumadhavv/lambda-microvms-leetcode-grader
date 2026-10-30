// Request validation for POST /grade. Hand-written so the VM bundle stays tiny.
export const MAX_BODY_BYTES = 100 * 1024;
export const MAX_CODE_BYTES = 50 * 1024;
export const MAX_INPUTS = 20;

export type Parsed =
  | { ok: true; code: string; inputs: string[] }
  | { ok: false; status: number; error: string };

export function parseGradeRequest(raw: string): Parsed {
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return bad(413, "body too large");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return bad(400, "invalid JSON");
  }
  if (typeof body !== "object" || body === null) return bad(400, "body must be an object");
  const { language, code, inputs } = body as Record<string, unknown>;
  if (language !== "python") return bad(400, 'language must be "python"');
  if (typeof code !== "string") return bad(400, "code must be a string");
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) return bad(413, "code too large");
  if (!Array.isArray(inputs) || !inputs.every((i) => typeof i === "string")) {
    return bad(400, "inputs must be string[]");
  }
  if (inputs.length > MAX_INPUTS) return bad(400, "too many inputs");
  return { ok: true, code, inputs };
}

function bad(status: number, error: string): Parsed {
  return { ok: false, status, error };
}
