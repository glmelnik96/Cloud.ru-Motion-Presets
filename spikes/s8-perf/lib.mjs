// Helpers for spike S8 (MOGRT performance in Premiere). Everything except waitValidFile and the
// measurement file IO is pure; tests/spikes/s8-perf.test.mjs covers it and waitValidFile.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workPath } from '../../tools/lib/work.mjs';
import { packDir } from '../../tools/packs/paths.mjs';
import { RESULTS_DIR } from '../../tools/spike/result.mjs';
import { waitStableFile } from '../../tools/spike/wait-file.mjs';

export const S8_ID = 'S8';
export const S8_TITLE = 'Производительность MOGRT';
export const S8_FALLBACK = 'Элементы без полей сверх бюджета уходят в T2-предрендеры. Элементы с полями вставляются MOGRT, '
  + 'и панель подсказывает «Клип → Render and Replace» (ProRes 4444 с альфой); автоматического рендера заполненного '
  + 'экземпляра в v1 нет';
export const S8_NOTES = 'Фаза 0: замер без вердикта по бюджету. Существующие композиции экспортированы в MOGRT как есть; '
  + 'числа Premiere хранятся по машинам (имя машины в названиях проверок). Бюджет производительности фиксируется только '
  + 'после повтора на мастерах первого пакета (§3.1 S8) на самой слабой машине команды по инвентаризации (часть F). '
  + 'Цифры: spikes/results/S8.data.json.';
export const S8_MEASUREMENTS = path.join(RESULTS_DIR, 'S8.data.json');
export const RANGE_SEC = 10;

// Comps from spec §3.1 S8: podcast frame with Z fly-in and motion blur, webinar screen, twinkling grid.
export const S8_PACKS = [
  { slug: 'podcast', comp: 'Подпись_спикера_1', folder: 'RENDER' },
  { slug: 'webinars', comp: 'Заставка с вижуалом', folder: 'Оформление' },
  { slug: 'smm', comp: 'BG_pattern_1x1_2', folder: 'BG_pattern' },
];

export const S8_SIZES = [
  { key: 'FHD', w: 1920, h: 1080 },
  { key: 'UHD', w: 3840, h: 2160 },
];

// Relinked working copies of plan 2 (tasks 1-3): packDir from tools/packs/paths.mjs, C:/CRBK/packs/<slug>
// next to the work folder (BRANDKIT_WORK moves both).
export function relinkedAep(slug, env = process.env, platform = process.platform) {
  return path.posix.join(packDir(slug, env, platform), slug + '_relinked.aep');
}

export function mogrtPath(slug) {
  return workPath('s8', 'mogrt', 'perf_' + slug + '.mogrt');
}

// Premiere install paths (sequence presets and the export preset). BRANDKIT_PR_ROOT overrides.
export function prPaths(env = process.env, platform = process.platform) {
  const root = String(env.BRANDKIT_PR_ROOT || (platform === 'darwin'
    ? '/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents'
    : 'C:/Program Files/Adobe/Adobe Premiere Pro 2026')).replace(/\\/g, '/');
  return {
    presets: {
      FHD: root + '/Settings/SequencePresets/HD 1080p/HD 1080p 25 fps.sqpreset',
      UHD: root + '/Settings/SequencePresets/UHD (4K)/UHD (4K) 2160p 25 fps.sqpreset',
    },
    exportPreset: root + '/MediaIO/systempresets/3F3F3F3F_4D6F6F56/Apple ProRes 422 LT.epr',
  };
}

// Comp names may be stored NFC or NFD (Mac); the probe accepts either form.
export function nameVariants(name) {
  const out = [];
  for (const v of [name.normalize('NFC'), name.normalize('NFD')]) if (!out.includes(v)) out.push(v);
  return out;
}

// One sequence per element and size, plus two baseline sequences with plain video.
export function sequencePlan(packs = S8_PACKS, sizes = S8_SIZES) {
  const out = [];
  for (const p of packs) {
    for (const s of sizes) out.push({ name: `S8_${p.slug}_${s.key}`, slug: p.slug, size: s.key, w: s.w, h: s.h });
  }
  for (const s of sizes) out.push({ name: `S8_base_${s.key}`, slug: 'base', size: s.key, w: s.w, h: s.h });
  return out;
}

export function realtimeFactor(mediaSec, wallMs) {
  if (!(wallMs > 0)) return null;
  return Math.round((mediaSec * 1000 / wallMs) * 100) / 100;
}

export function mergeMeasurements(prev, patch) {
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const out = { ...(prev || {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isObj(v) && isObj(out[k]) ? mergeMeasurements(out[k], v) : v;
  }
  return out;
}

export function readMeasurements(file = S8_MEASUREMENTS) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

export function updateMeasurements(patch, file = S8_MEASUREMENTS) {
  const next = mergeMeasurements(readMeasurements(file), patch);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

// Premiere numbers are kept per machine (spec §3.1: S8 belongs on the weakest machine of the inventory),
// so a later run on another machine adds to the file instead of replacing this one.
export function machineKey() {
  return os.hostname();
}

// perMachine: one entry of measurements.machines, i.e. { machine, pr: { inserts, exports } }.
export function summaryLines(perMachine, plan = sequencePlan()) {
  const pr = (perMachine && perMachine.pr) || {};
  const ins = pr.inserts || {};
  const exp = pr.exports || {};
  return plan.map((s) => {
    const i = ins[s.name];
    const e = exp[s.name];
    return [
      s.name.padEnd(16),
      i ? `insert ${(i.wallMs / 1000).toFixed(1)} s${i.order === 1 ? ' (first MOGRT in project)' : ''}` : 'insert -',
      e ? `export ${RANGE_SEC} s: ${(e.wallMs / 1000).toFixed(1)} s = ${e.realtime}x real time` : 'export -',
    ].join(' | ');
  });
}

// One manual observation: Program Monitor at Full or 1/2, dropped frame indicator after 10 s of playback.
// Optional check: in phase 0 S8 measures, the budget verdict comes after the repeat (spec §3.1 S8).
export function playbackCheck({ host, seq, res, dropped }) {
  if (!sequencePlan().some((s) => s.name === seq)) throw new Error('unknown sequence: ' + seq);
  if (res !== 'Full' && res !== '1/2') throw new Error('resolution must be Full or 1/2: ' + res);
  const n = Number(dropped);
  if (!Number.isInteger(n) || n < 0) throw new Error('dropped frames must be a whole number: ' + dropped);
  return {
    name: `pr@${host}: playback ${seq} ${res} without dropped frames`,
    pass: n === 0, required: false, detail: `dropped ${n} of ${RANGE_SEC * 25} frames`,
  };
}

// AE may write the .mogrt after exportAsMotionGraphicsTemplate returns (spec §1.1 item 3). The wait is the
// shared waitStableFile (tools/spike/wait-file.mjs: size and mtime unchanged for stableMs), then `validate`
// must accept the file. A stable file that does not validate may be a pause inside AE's write, so the wait
// goes on for a newer write until timeoutMs. ms = time from the start of the wait to the last write of the
// file (0 when it was complete before the wait began), null on failure.
export async function waitValidFile(file, { validate = null, stableMs = 4000, intervalMs = 500, timeoutMs = 900000 } = {}) {
  const t0 = Date.now();
  let sinceMs = 0;
  let last = '';
  for (;;) {
    const left = Math.max(0, timeoutMs - (Date.now() - t0));
    const w = await waitStableFile(file, { stableMs, intervalMs, timeoutMs: left, sinceMs });
    if (!w.ok) return { ok: false, bytes: w.size, ms: null, detail: 'timeout: ' + w.reason + (last ? '; ' + last : '') };
    const v = validate ? validate(file) : { ok: true, detail: '' };
    if (v.ok) return { ok: true, bytes: w.size, ms: Math.max(0, Math.round(w.mtimeMs - t0)), detail: v.detail };
    last = 'stable but invalid: ' + v.detail;
    sinceMs = w.mtimeMs;
  }
}
