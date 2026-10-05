import { describe, it, expect } from 'vitest';
import { parseReply } from '../../../panel/src/bridge/reply';

describe('parseReply', () => {
  it('maps an empty reply to HOST_EMPTY', () => {
    for (const raw of ['', 'undefined', 'null', '  \n']) {
      const r = parseReply(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('HOST_EMPTY');
    }
  });

  it('maps EvalScript error to HOST_EVAL_ERROR with the raw text as the message', () => {
    expect(parseReply('EvalScript error.')).toEqual({ ok: false, error: { code: 'HOST_EVAL_ERROR', message: 'EvalScript error.' } });
    expect(parseReply('Error: EvalScript error. (ReferenceError: CRBK is undefined)')).toEqual({
      ok: false,
      error: { code: 'HOST_EVAL_ERROR', message: 'Error: EvalScript error. (ReferenceError: CRBK is undefined)' },
    });
  });

  it('maps a non-JSON reply to HOST_BAD_REPLY', () => {
    for (const raw of ['hello', '{"ok":', "{ok:true}", 'OK']) {
      const r = parseReply(raw);
      expect(r).toEqual({ ok: false, error: { code: 'HOST_BAD_REPLY', message: raw } });
    }
  });

  it('maps JSON without a boolean ok to HOST_BAD_REPLY', () => {
    for (const raw of ['{"data":1}', '{"ok":"true","data":1}', '{"ok":1}', '[1,2]', '5', 'true', '"text"']) {
      const r = parseReply(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('HOST_BAD_REPLY');
    }
  });

  it('caps the message of a long bad reply', () => {
    const r = parseReply('x'.repeat(5000));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('HOST_BAD_REPLY');
      expect((r.error.message ?? '').length).toBeLessThan(600);
    }
  });

  it('returns a HostReply as the host sent it', () => {
    expect(parseReply('{"ok":true,"data":{"build":"abc","app":"26.5x89"}}')).toEqual({ ok: true, data: { build: 'abc', app: '26.5x89' } });
    expect(parseReply('{"ok":true,"data":null}')).toEqual({ ok: true, data: null });
    expect(parseReply(' {"ok":false,"error":{"code":"NO_TARGET","message":""}}\n')).toEqual({
      ok: false,
      error: { code: 'NO_TARGET', message: '' },
    });
    expect(parseReply('{"ok":false,"error":{"code":"HOST_EXCEPTION","message":"x is undefined","line":42}}')).toEqual({
      ok: false,
      error: { code: 'HOST_EXCEPTION', message: 'x is undefined', line: 42 },
    });
  });

  it('keeps Cyrillic in a reply, raw or escaped', () => {
    expect(parseReply('{"ok":true,"data":{"name":"Титр Ёлка 16×9"}}')).toEqual({ ok: true, data: { name: 'Титр Ёлка 16×9' } });
    expect(parseReply('{"ok":true,"data":{"name":"\\u0401\\u00d7"}}')).toEqual({ ok: true, data: { name: 'Ё×' } });
  });

  it('keeps a real reply that only quotes "EvalScript error" in its own text', () => {
    const raw = '{"ok":false,"error":{"code":"HOST_EXCEPTION","message":"EvalScript error. in a nested eval"}}';
    expect(parseReply(raw)).toEqual({ ok: false, error: { code: 'HOST_EXCEPTION', message: 'EvalScript error. in a nested eval' } });
  });

  it('treats a failure without an error code as a bad reply', () => {
    for (const raw of ['{"ok":false}', '{"ok":false,"error":"boom"}', '{"ok":false,"error":{"code":7}}']) {
      const r = parseReply(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toEqual({ code: 'HOST_BAD_REPLY', message: raw });
    }
  });
});
