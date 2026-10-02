// Pure helpers for spike S9 (Premiere 27 beta, UXP): detect the beta and turn the plugin report into checks.
export const S9_ID = 'S9';
export const S9_TITLE = 'UXP: MogrtText в бете 27';
export const S9_FALLBACK = 'Переезд Premiere на UXP откладывается, CEP остаётся (§6.2)';
export const S9_REVISIT = 'Повторить после Adobe MAX (10–12 ноября 2026) или когда бета 27 станет доступна команде (D20, §6.2).';

// entries: folder names in C:/Program Files/Adobe (Windows) or /Applications (macOS).
export function detectBeta(entries) {
  const names = (entries || []).map(String);
  return {
    premiereBeta: names.find((n) => /premiere/i.test(n) && /\(beta\)|\bbeta\b/i.test(n)) || null,
    udt: names.find((n) => /uxp developer tool/i.test(n)) || null,
  };
}

export function checksFromReport(report) {
  const r = report || {};
  const steps = Array.isArray(r.steps) ? r.steps : [];
  const step = (name) => steps.find((s) => s.name === name) || null;
  const ins = step('insertMogrtFromPath');
  const cap = step('find AE.ADBE Capsule');
  const params = Array.isArray(r.params) ? r.params : [];
  const text = r.text || {};
  const dd = r.dropdown || {};
  const version = r.host && r.host.version ? String(r.host.version) : '';
  return [
    { name: 'uxp: host is Premiere 27.x (beta)', pass: /^27\./.test(version), required: false, detail: version || 'no host version' },
    {
      name: 'uxp: insertMogrtFromPath placed a clip with an AE.ADBE Capsule component',
      pass: Boolean(ins && ins.ok && cap && cap.ok), required: true,
      detail: [ins && ins.detail, cap && cap.detail].filter(Boolean).join('; '),
    },
    {
      name: 'uxp: parameter display names are readable',
      pass: params.some((p) => typeof p.displayName === 'string' && p.displayName !== ''), required: false,
      detail: params.map((p) => p.index + ':' + (p.displayName || '?') + ':' + p.kind).join(', '),
    },
    { name: 'uxp: getStartValue() returns MogrtText for the name field', pass: text.kind === 'MogrtText', required: true, detail: 'param ' + text.index + ' picked by ' + text.by },
    {
      name: 'uxp: MogrtText.setText with Cyrillic reads back',
      pass: text.ok === true && typeof text.written === 'string' && text.readback === text.written, required: true,
      detail: JSON.stringify({ before: text.before, written: text.written, readback: text.readback, transaction: text.transaction, uniform: text.uniform }),
    },
    {
      // The plugin finds the dropdown by name only; without it the report lists the names seen.
      name: 'uxp: dropdown set through createKeyframe(number) reads back',
      pass: dd.ok === true && dd.readback === dd.written, required: true,
      detail: Array.isArray(dd.seen)
        ? `no parameter named "${dd.missing}"; seen: ${dd.seen.map((n) => n || '?').join(', ')}`
        : JSON.stringify({ index: dd.index, by: dd.by, before: dd.before, written: dd.written, readback: dd.readback, transaction: dd.transaction }),
    },
    { name: 'uxp: no uncaught error in the plugin', pass: !r.error, required: false, detail: r.error || '' },
  ];
}
