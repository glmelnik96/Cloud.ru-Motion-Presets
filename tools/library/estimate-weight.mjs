#!/usr/bin/env node
// Library weight estimate for D24 (spec 4.4 "Вес"): the T2 matrix times bitrates gives megabytes
// for the default install and for the optional extra (4K loops, rare formats).
//   node tools/library/estimate-weight.mjs [--matrix docs/decisions/t2-matrix.draft.json]
//        [--bitrates <file>] [--codec png_mov] [--out docs/decisions/weight-estimate.md]
// Bitrates: built-in defaults below, replaced by workPath('s11', 'bitrates.json') once S11 has
// written it, or by --bitrates. Sizes are decimal: 1 MB = 1e6 bytes, 1 GB = 1e9 bytes.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');
const REF_PIXELS = 1920 * 1080; // 2,073,600 px; 1440x1440 SMM frames have the same count

export const FORMATS = {
  '16x9': [1920, 1080],
  '16x9_4K': [3840, 2160],
  '9x16': [1080, 1920],
  '1x1': [1080, 1080],
  '4x5': [1080, 1350],
  '4x3': [1440, 1080],
};

// MB/s at REF_PIXELS; the rate scales linearly with the pixel count (spec 4.4: 4K is up to 4x).
export const DEFAULT_RATES = {
  prores4444: {
    mbPerSec: 15,
    atPixels: REF_PIXELS,
    source: 'spec 4.4; SMM BG_pattern renders 12.6-17.1 MB/s at 1440x1440 (docs/research/2026-10-02/media_inventory.txt)',
  },
  png_mov: {
    mbPerSec: 2.5,
    atPixels: REF_PIXELS,
    source: 'codec bench (research_distribution_assets.json): PNG in MOV 1.7-2.4 MB/s at about 2 Mpx; S11 replaces it',
  },
};

const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const readJson = (p) => JSON.parse(stripBom(readFileSync(p, 'utf8')));

// The S11 table (part E): { date, platform, unit, codecs: { prores_ae, prores_ks, png } }, each codec with
// mean and max in MB/s per megapixel at 25 fps. The max is used: prores_ae (stream copy of the AE render)
// stands for ProRes 4444, png for PNG in MOV. A hand-made override { codec: { mbPerSec, atPixels } } also works.
const S11_CODECS = { prores4444: 'prores_ae', png_mov: 'png' };

export function normalizeRates(raw) {
  const out = {};
  if (raw && raw.codecs && typeof raw.codecs === 'object') {
    for (const [codec, key] of Object.entries(S11_CODECS)) {
      const c = raw.codecs[key];
      if (c && c.max > 0) {
        out[codec] = {
          mbPerSec: c.max * (REF_PIXELS / 1e6),
          atPixels: REF_PIXELS,
          source: `S11 ${key}: max ${c.max} MB/s per Mpx (${raw.date || 'no date'}, ${raw.platform || 'no platform'})`,
        };
      }
    }
    return out;
  }
  for (const [codec, r] of Object.entries(raw || {})) {
    if (!(r && r.mbPerSec > 0 && r.atPixels > 0)) throw new Error(`bad rate for ${codec}: ${JSON.stringify(r)}`);
    out[codec] = { mbPerSec: r.mbPerSec, atPixels: r.atPixels, source: r.source || 'override' };
  }
  return out;
}

export function loadRates(bitratesPath) {
  const file = bitratesPath || workPath('s11', 'bitrates.json');
  if (!existsSync(file)) {
    if (bitratesPath) throw new Error('bitrates file not found: ' + bitratesPath);
    return { rates: { ...DEFAULT_RATES }, from: 'built-in defaults' };
  }
  return { rates: { ...DEFAULT_RATES, ...normalizeRates(readJson(file)) }, from: file };
}

export function mbFor({ format, seconds, copies = 1, codec, rateFactor = 1 }, rates, sizes = FORMATS) {
  const size = sizes[format];
  if (!size) throw new Error(`unknown format ${format} (known: ${Object.keys(sizes).join(', ')})`);
  const rate = rates[codec];
  if (!rate) throw new Error(`unknown codec ${codec} (known: ${Object.keys(rates).join(', ')})`);
  return rate.mbPerSec * ((size[0] * size[1]) / rate.atPixels) * seconds * copies * rateFactor;
}

// codec: optional override for every row, to compare ProRes 4444 with PNG in MOV (S11).
export function estimate(matrix, rates, { codec } = {}) {
  const sizes = { ...FORMATS, ...(matrix.sizes || {}) };
  const rows = [];
  for (const item of matrix.items) {
    const it = codec ? { ...item, codec } : item;
    const each = (format) => mbFor({ ...it, format }, rates, sizes);
    const main = it.optional ? [] : it.formats;
    const extra = it.optional ? it.formats.concat(it.optionalFormats || []) : it.optionalFormats || [];
    rows.push({
      id: it.id,
      title_ru: it.title_ru,
      codec: it.codec,
      seconds: it.seconds,
      copies: it.copies || 1,
      rateFactor: it.rateFactor || 1,
      defaultFormats: main,
      optionalFormats: extra,
      defaultMB: main.reduce((s, f) => s + each(f), 0),
      optionalMB: extra.reduce((s, f) => s + each(f), 0),
    });
  }
  const extras = (matrix.extras || []).map((x) => ({
    title_ru: x.title_ru,
    defaultMB: x.optional ? 0 : x.count * x.mbEach,
    optionalMB: x.optional ? x.count * x.mbEach : 0,
  }));
  const sum = (key) => rows.concat(extras).reduce((s, r) => s + r[key], 0);
  const defaultMB = sum('defaultMB');
  const optionalMB = sum('optionalMB');
  return { rows, extras, totals: { defaultMB, optionalMB, fullMB: defaultMB + optionalMB } };
}

const mb = (x) => String(Math.round(x));
const gb = (x) => (x / 1000).toFixed(2).replace('.', ',');

export function renderMarkdown(result, { matrixFile = '', ratesFrom = '', rates = {}, codec } = {}) {
  const t = result.totals;
  const lines = [
    '# Оценка веса библиотеки (D24)',
    '',
    `Собрано командой \`node tools/library/estimate-weight.mjs\`; матрица: \`${matrixFile}\`; битрейты: ${ratesFrom}. МБ и ГБ десятичные.`,
    '',
  ];
  if (codec) lines.push(`Сценарий: все строки в кодеке ${codec} (--codec).`, '');
  lines.push(
    `- **Установка по умолчанию:** ${gb(t.defaultMB)} ГБ`,
    `- **Отдельная опция (4K и редкие форматы):** ${gb(t.optionalMB)} ГБ`,
    `- **Полный дистрибутив:** ${gb(t.fullMB)} ГБ`,
    '',
    '| Элемент | Кодек | Сек | Копий | Коэф. | Форматы по умолчанию | МБ | Форматы опции | МБ |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  for (const r of result.rows) {
    lines.push(`| ${r.title_ru} (\`${r.id}\`) | ${r.codec} | ${r.seconds} | ${r.copies} | ${r.rateFactor} | ` +
      `${r.defaultFormats.join(', ') || '—'} | ${mb(r.defaultMB)} | ${r.optionalFormats.join(', ') || '—'} | ${mb(r.optionalMB)} |`);
  }
  for (const x of result.extras) {
    lines.push(`| ${x.title_ru} | — | — | — | — | — | ${mb(x.defaultMB)} | — | ${mb(x.optionalMB)} |`);
  }
  lines.push(`| **Итого** | | | | | | **${mb(t.defaultMB)}** | | **${mb(t.optionalMB)}** |`);
  lines.push('', '| Кодек | МБ/с на 1920×1080 | Источник |', '|---|---|---|');
  for (const [codec, r] of Object.entries(rates)) {
    lines.push(`| ${codec} | ${((r.mbPerSec * REF_PIXELS) / r.atPixels).toFixed(1)} | ${r.source} |`);
  }
  return lines.join('\n') + '\n';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  const matrixFile = val('--matrix') || path.join(REPO, 'docs', 'decisions', 't2-matrix.draft.json');
  try {
    const { rates, from } = loadRates(val('--bitrates'));
    const codec = val('--codec');
    const result = estimate(readJson(matrixFile), rates, { codec });
    const md = renderMarkdown(result, { matrixFile: path.relative(REPO, matrixFile).replace(/\\/g, '/'), ratesFrom: from, rates, codec });
    const out = val('--out');
    if (out) {
      writeFileSync(out, md, 'utf8');
      console.log(`written ${out}: default ${gb(result.totals.defaultMB)} GB, optional ${gb(result.totals.optionalMB)} GB`);
    } else {
      process.stdout.write(md);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
