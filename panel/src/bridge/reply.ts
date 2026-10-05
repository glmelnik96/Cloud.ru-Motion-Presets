// What evalScript hands back, as a HostReply. CRBK.call always answers with a JSON HostReply (panel/host/common.jsx);
// anything else comes from CEP or the engine: '' / 'undefined' / 'null' when the script produced no value (a cold
// engine answers like that too), 'EvalScript error.' when it threw outside CRBK.call, e.g. ReferenceError on CRBK
// before the adapter is loaded.
import type { HostError, HostReply } from '../core/types';

const MAX_MESSAGE = 500;

function fail(code: string, message: string): { ok: false; error: HostError } {
  return { ok: false, error: { code, message } };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function parseReply(raw: string): HostReply<unknown> {
  const text = String(raw);
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') return fail('HOST_EMPTY', text);
  // JSON first: a real reply may quote 'EvalScript error' in its own message (HOST_EXCEPTION, diag).
  const v = parseJson(trimmed);
  if (isRecord(v) && typeof v.ok === 'boolean') {
    if (v.ok) return v as HostReply<unknown>;
    // A failure without a code would break every caller that switches on error.code.
    if (isRecord(v.error) && typeof v.error.code === 'string') return v as HostReply<unknown>;
  }
  if (text.indexOf('EvalScript error') !== -1) return fail('HOST_EVAL_ERROR', text);
  return fail('HOST_BAD_REPLY', text.length > MAX_MESSAGE ? text.slice(0, MAX_MESSAGE) + '...' : text);
}
