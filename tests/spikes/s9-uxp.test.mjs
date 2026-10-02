import { describe, it, expect } from 'vitest';
import { detectBeta, checksFromReport } from '../../spikes/s9-uxp-beta/lib.mjs';
import { decideVerdict } from '../../tools/spike/result.mjs';

const good = {
  host: { name: 'premierepro', version: '27.0.0' },
  steps: [
    { name: 'insertMogrtFromPath', ok: true, ms: 900, detail: '2 items returned' },
    { name: 'find AE.ADBE Capsule', ok: true, ms: 0, detail: 'attempt 1, component 2' },
  ],
  params: [{ index: 0, displayName: 'Имя', kind: 'MogrtText' }, { index: 5, displayName: 'Стиль', kind: 'Keyframe' }],
  text: { index: 0, by: 'displayName', kind: 'MogrtText', before: 'Имя Фамилия', written: 'Проверка ЁЙ ёй S9', readback: 'Проверка ЁЙ ёй S9', transaction: true, ok: true },
  dropdown: { index: 5, by: 'displayName', before: 1, written: 2, readback: 2, transaction: true, ok: true },
  error: null,
};

describe('S9 helpers', () => {
  it('finds Premiere (Beta) and UDT among installed folders', () => {
    expect(detectBeta(['Adobe Premiere Pro 2026', 'Adobe Premiere Pro (Beta)', 'Adobe UXP Developer Tools']))
      .toEqual({ premiereBeta: 'Adobe Premiere Pro (Beta)', udt: 'Adobe UXP Developer Tools' });
    expect(detectBeta(['Adobe Premiere Pro 2026', 'Adobe Media Encoder 2026'])).toEqual({ premiereBeta: null, udt: null });
  });
  it('passes a complete report', () => {
    expect(decideVerdict(checksFromReport(good))).toBe('yes');
  });
  it('fails when the text does not read back', () => {
    const bad = { ...good, text: { ...good.text, readback: 'Имя Фамилия', ok: false } };
    expect(decideVerdict(checksFromReport(bad))).toBe('no');
  });
  it('fails when the dropdown does not read back', () => {
    const bad = { ...good, dropdown: { ...good.dropdown, readback: 1, ok: false } };
    expect(decideVerdict(checksFromReport(bad))).toBe('no');
  });
  it('fails the dropdown and lists the names seen when there is no «Стиль»', () => {
    const noStyle = { ...good, dropdown: { ok: false, by: 'displayName', missing: 'Стиль', seen: ['Имя', null, 'Цвет'] } };
    const checks = checksFromReport(noStyle);
    expect(decideVerdict(checks)).toBe('no');
    expect(checks.find((c) => /dropdown/.test(c.name)).detail).toBe('no parameter named "Стиль"; seen: Имя, ?, Цвет');
  });
  it('fails an aborted run', () => {
    expect(decideVerdict(checksFromReport({ error: 'no active sequence', steps: [] }))).toBe('no');
  });
  it('is partial when only the optional checks fail', () => {
    const noNames = { ...good, params: good.params.map((p) => ({ ...p, displayName: '' })) };
    expect(decideVerdict(checksFromReport(noNames))).toBe('partial');
  });
});
