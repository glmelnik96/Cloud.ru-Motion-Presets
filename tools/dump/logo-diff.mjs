#!/usr/bin/env node
// Logo geometry diff (spec D18): the cube and the "cloud.ru" wordmark of every logo copy in the pack
// dumps, normalized and compared pairwise and with the master SVG; colours of each copy.
//   node tools/dump/logo-diff.mjs [--dumps C:/CRBK/work/dumps] [--master brand/logo/master-ae-motion-live.svg]
//                                 [--tokens brand/tokens.json] [--out docs/research/logo-geometry.md] [--no-discover]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';
import { deltaE2000Hex } from '../color/deltae.mjs';
import { classify, layerColors, loadPalette, normalizeHex } from './colors.mjs';
import { compareOutlines, dropPlate, fingerprint, groupMatrix, IDENTITY, multiply, normalize, pathData, transformSubpath } from './geometry.mjs';
import { child, layerProp, loadDumpRoot } from './model.mjs';

const require = createRequire(import.meta.url);
const { parseSvg } = require('../vendor/svgpath.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const PARTS = { cube: 'куб', wordmark: 'надпись «cloud.ru»' };
export const LIMITS = { same: 0.001, close: 0.005 }; // in units of the part width
const PREFIX = { cube: 'C', wordmark: 'W' };

export function verdict(max) {
  if (max <= LIMITS.same) return 'совпадает';
  if (max <= LIMITS.close) return 'близко';
  return 'отличается';
}

// Master: the path filled with the brand green is the cube, every other path is the wordmark.
export function masterParts(svgText) {
  const svg = parseSvg(svgText);
  const parts = { cube: [], wordmark: [] };
  const fills = { cube: new Set(), wordmark: new Set() };
  for (const p of svg.paths) {
    const hex = normalizeHex(p.fill) || p.fill;
    const part = hex === '#26D07C' ? 'cube' : 'wordmark';
    parts[part].push(...p.subpaths);
    fills[part].add(hex);
  }
  return { parts, fills: { cube: [...fills.cube], wordmark: [...fills.wordmark] } };
}

function restValue(node) {
  if (!node) return { value: undefined, animated: false };
  if (Array.isArray(node.keys) && node.keys.length) return { value: node.keys[node.keys.length - 1].value, animated: true };
  return { value: node.value, animated: false };
}

function groupTransform(tr, notes, trail) {
  const get = (mn, fallback) => {
    const { value, animated } = restValue(child(tr, mn));
    if (animated) notes.push(`${trail}: ${mn} анимировано, взято значение последнего ключа`);
    return value === undefined || value === null ? fallback : value;
  };
  const skew = get('ADBE Vector Skew', 0);
  if (Math.abs(skew) > 1e-6) notes.push(`${trail}: скос ${skew}° не учтён`);
  return {
    anchor: get('ADBE Vector Anchor', [0, 0]), position: get('ADBE Vector Position', [0, 0]),
    scale: get('ADBE Vector Scale', [100, 100]), rotation: get('ADBE Vector Rotation', 0),
  };
}

// Outline of a shape layer in layer space: enabled path shapes with their group transforms applied.
// Rectangles, ellipses and stars are listed, not drawn; Merge Paths is counted.
export function extractShape(layer) {
  const out = { subpaths: [], pathCount: 0, ignored: [], merges: 0, offSkipped: 0, notes: [], layerScale: null };
  const root = (layer.props || []).find((n) => n.matchName === 'ADBE Root Vectors Group');
  if (!root) { out.notes.push('не слой-фигура'); return out; }
  const visit = (nodes, m, trail) => {
    for (const n of nodes || []) {
      if (n.enabled === false) { out.offSkipped += 1; continue; }
      const t = trail ? trail + ' › ' + n.name : n.name;
      if (n.matchName === 'ADBE Vector Group') {
        const tr = child(n, 'ADBE Vector Transform Group');
        const gm = tr ? groupMatrix(groupTransform(tr, out.notes, t)) : IDENTITY;
        visit((child(n, 'ADBE Vectors Group') || {}).children, multiply(m, gm), t);
      } else if (n.matchName === 'ADBE Vector Shape - Group') {
        const { value, animated } = restValue(child(n, 'ADBE Vector Shape'));
        if (animated) out.notes.push(`${t}: путь анимирован, взят последний ключ`);
        if (value && Array.isArray(value.vertices)) {
          out.subpaths.push(transformSubpath(value, m));
          out.pathCount += 1;
        } else {
          out.notes.push(`${t}: нет вершин${value && value.skipped ? ' (пропущены по лимиту дампа)' : ''}`);
        }
      } else if (/^ADBE Vector Shape - (Rect|Ellipse|Star)$/.test(n.matchName || '')) {
        out.ignored.push(t);
      } else if (n.matchName === 'ADBE Vector Filter - Merge') {
        out.merges += 1;
      }
    }
  };
  visit(root.children, IDENTITY, '');
  const sc = restValue(layerProp(layer, 'ADBE Transform Group', 'ADBE Scale')).value;
  out.layerScale = Array.isArray(sc) ? sc.slice(0, 2) : null;
  return out;
}

function looksLikeCube(layer) {
  if (layer.type !== 'shape' || extractShape(layer).pathCount !== 3) return false;
  return layerColors(layer).colors.some((c) => c.hex && c.kind !== 'stroke' && deltaE2000Hex(c.hex, '#26D07C') <= 10);
}

function looksLikeWordmark(layer) {
  if (layer.type !== 'shape') return false;
  const n = extractShape(layer).pathCount;
  return n >= 9 && n <= 12;
}

// Copies named in the audits, plus (discover) look-alikes: a 3-path green shape layer is a cube,
// a 9-12-path shape layer next to it is a wordmark.
export function findCopies(bundles, candidates, { discover = true } = {}) {
  const copies = [];
  const missing = [];
  const taken = new Set();
  const add = (b, d, layer, part, source) => {
    const key = `${b.index.slug}|${d.comp.id}|${layer.index}`;
    if (taken.has(key)) return;
    taken.add(key);
    copies.push({ slug: b.index.slug, comp: d.comp.name, compId: d.comp.id, compSlug: d.compSlug, layer: layer.name,
      layerIndex: layer.index, part, source, layerData: layer });
  };
  for (const c of candidates) {
    const b = bundles.find((x) => x.index.slug === c.slug);
    if (!b) { missing.push({ ...c, part: '—', reason: 'нет дампа пакета' }); continue; }
    const dumps = b.comps.filter((d) => d.comp.name === c.comp);
    if (!dumps.length) { missing.push({ ...c, part: '—', reason: 'нет композиции' }); continue; }
    for (const d of dumps) {
      for (const part of ['cube', 'wordmark']) {
        const layers = d.layers.filter((l) => l.name === c[part]);
        if (!layers.length) missing.push({ slug: c.slug, comp: c.comp, layer: c[part], part, reason: 'нет слоя' });
        for (const l of layers) add(b, d, l, part, 'аудит');
      }
    }
  }
  if (discover) {
    for (const b of bundles) {
      for (const d of b.comps) {
        const cubes = d.layers.filter(looksLikeCube);
        if (!cubes.length) continue;
        for (const l of cubes) add(b, d, l, 'cube', 'эвристика');
        for (const l of d.layers.filter(looksLikeWordmark)) add(b, d, l, 'wordmark', 'эвристика');
      }
    }
  }
  return { copies, missing };
}

function analysePart(part, copies, masterSubpaths) {
  const master = normalize(masterSubpaths);
  const groups = new Map();
  for (const c of copies) {
    c.shape = extractShape(c.layerData);
    if (!c.shape.subpaths.length) { c.error = 'нет контуров'; continue; }
    try {
      const plate = dropPlate(c.shape.subpaths); // a plate in the same shape is not part of the logo
      c.plateDropped = plate.dropped;
      c.norm = normalize(plate.subpaths);
    } catch (e) {
      c.error = e.message;
      continue;
    }
    c.fp = fingerprint(c.norm.subpaths);
    if (!groups.has(c.fp)) groups.set(c.fp, { fp: c.fp, norm: c.norm, members: [] });
    groups.get(c.fp).members.push(c);
  }
  const list = [...groups.values()];
  list.forEach((g, i) => {
    g.label = PREFIX[part] + (i + 1);
    g.members.forEach((c) => { c.group = g.label; });
    g.toMaster = compareOutlines(g.norm.subpaths, master.subpaths);
    g.verdict = verdict(g.toMaster.max);
  });
  const pairs = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      pairs.push({ a: list[i].label, b: list[j].label, ...compareOutlines(list[i].norm.subpaths, list[j].norm.subpaths) });
    }
  }
  return { part, master, groups: list, pairs, copies };
}

export function analyse(copies, master) {
  const out = {};
  for (const part of Object.keys(PARTS)) {
    out[part] = analysePart(part, copies.filter((c) => c.part === part), master.parts[part]);
  }
  return out;
}

export function overlaySvg(masterNorm, groupNorm) {
  const k = 1000;
  const h = Math.ceil(Math.max(masterNorm.aspect, groupNorm.aspect) * k);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 ${k + 40} ${h + 40}" width="${k + 40}" height="${h + 40}">`,
    `<rect x="-20" y="-20" width="${k + 40}" height="${h + 40}" fill="#FFFFFF"/>`,
    `<path d="${pathData(masterNorm.subpaths, k)}" fill="#26D07C" fill-opacity="0.25" stroke="#222222" stroke-width="1"/>`,
    `<path d="${pathData(groupNorm.subpaths, k)}" fill="none" stroke="#FF00FF" stroke-width="1"/>`,
    '</svg>',
    '',
  ].join('\n');
}

const pm = (v) => (v * 1000).toFixed(2);
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

function colourCell(layer, palette) {
  const { colors, skippedDefaults } = layerColors(layer);
  const parts = colors.map((c) => {
    if (!c.hex) return `${c.kind}: цвета не читаются`;
    const k = classify(c.hex, palette);
    const where = k.status === 'palette' ? 'палитра' : k.status === 'near' ? `≈ ${k.nearest}, ΔE ${k.dE}` : `вне палитры, ближе всего ${k.nearest}, ΔE ${k.dE}`;
    const flags = [c.animated ? 'ключи' : '', c.expression ? 'выражение' : '', c.off ? 'выключен' : ''].filter(Boolean).join(', ');
    return `${c.hex} ${c.kind} (${where}${flags ? '; ' + flags : ''})`;
  });
  if (skippedDefaults) parts.push(`${skippedDefaults} цвет(а) эффектов по умолчанию пропущено`);
  return parts.join('; ') || '—';
}

export function renderReport(analysis, { missing = [], palette, master, meta = {} }) {
  const L = [];
  L.push('# Геометрия копий логотипа (D18)', '');
  L.push(`Собрано командой \`node tools/dump/logo-diff.mjs\` ${meta.date || ''} из дампов \`${meta.dumps || ''}\`; руками не править.`, '');
  L.push(`**Мастер:** \`${meta.masterFile || ''}\` (sha256 \`${meta.masterSha || ''}\`), копия \`html/templates/cn-assets/logo_color.svg\` из ae-motion-live. Сверка с Figma BAZIS (D18) — отдельно, когда будет доступ к коннектору.`, '');
  L.push('**Метод.** Контуры копии берутся из дампа слоя: пути фигур с трансформациями их групп, без трансформации самого слоя. ' +
    'Контур сдвигается к началу габарита и масштабируется к ширине 1. Отклонение — расстояние от точек одного контура до другого: ' +
    'max (хаусдорфово) и mean, в ‰ ширины детали (1 ‰ = 1 px при ширине 1000 px). ' +
    `«Совпадает» — max ≤ ${LIMITS.same * 1000} ‰, «близко» — ≤ ${LIMITS.close * 1000} ‰, иначе «отличается». ` +
    'Копии с одинаковой геометрией (до 0,1 ‰) объединены в группу. Взаимное положение куба и надписи здесь не сверяется: его видно на эталонных кадрах.', '');
  // The same comp name twice in one pack: tell the copies apart by comp id.
  const ids = new Map();
  for (const part of Object.keys(PARTS)) {
    for (const c of analysis[part].copies) {
      const k = c.slug + '|' + c.comp;
      if (!ids.has(k)) ids.set(k, new Set());
      ids.get(k).add(c.compId);
    }
  }
  const compCell = (c) => (ids.get(c.slug + '|' + c.comp).size > 1 ? `${c.comp} (id ${c.compId})` : c.comp);
  for (const part of Object.keys(PARTS)) {
    const a = analysis[part];
    L.push(`## ${PARTS[part][0].toUpperCase() + PARTS[part].slice(1)}`, '');
    L.push('| Группа | Пакет | Композиция | Слой | Найдено | Контуров | Масштаб слоя | Замечания |', '|---|---|---|---|---|---|---|---|');
    for (const c of a.copies) {
      const s = c.shape || { pathCount: 0, notes: [], ignored: [], merges: 0, offSkipped: 0 };
      const notes = [...s.notes];
      if (c.error) notes.push(c.error);
      if (s.ignored.length) notes.push(`без учёта: ${s.ignored.join(', ')}`);
      if (s.merges) notes.push(`Merge Paths: ${s.merges}`);
      if (c.plateDropped) notes.push('плашка-прямоугольник в той же фигуре не сравнивается');
      if (s.offSkipped) notes.push(`выключено: ${s.offSkipped}`);
      const sc = s.layerScale ? `${s.layerScale[0]} × ${s.layerScale[1]} %` + (Math.abs(s.layerScale[0] - s.layerScale[1]) > 1e-6 ? ' (неравномерно)' : '') : '—';
      L.push(`| ${c.group || '—'} | ${esc(c.slug)} | ${esc(compCell(c))} | ${esc(c.layer)} | ${c.source} | ${s.pathCount} | ${sc} | ${esc(notes.join('; ') || '—')} |`);
    }
    L.push('', `Мастер: контуров ${a.master.subpaths.length}, пропорция ${a.master.aspect.toFixed(4)}.`, '');
    L.push('| Группа | Копий | Пропорция (в/ш) | max к мастеру, ‰ | mean, ‰ | Вывод | Наложение |', '|---|---|---|---|---|---|---|');
    for (const g of a.groups) {
      L.push(`| ${g.label} | ${g.members.length} | ${g.norm.aspect.toFixed(4)} | ${pm(g.toMaster.max)} | ${pm(g.toMaster.mean)} | ${g.verdict} | [${part}-${g.label}.svg](logo-geometry/${part}-${g.label}.svg) |`);
    }
    if (a.groups.length > 1) {
      L.push('', 'Попарно, max ‰ (mean ‰):', '');
      L.push('| | ' + a.groups.map((g) => g.label).join(' | ') + ' |', '|---|' + a.groups.map(() => '---|').join(''));
      for (const g of a.groups) {
        const cells = a.groups.map((h) => {
          if (h === g) return '—';
          const p = a.pairs.find((x) => (x.a === g.label && x.b === h.label) || (x.a === h.label && x.b === g.label));
          return `${pm(p.max)} (${pm(p.mean)})`;
        });
        L.push(`| ${g.label} | ${cells.join(' | ')} |`);
      }
    }
    L.push('');
  }
  L.push('## Цвета копий', '');
  L.push(`Палитра: ${palette.source}${palette.fallback ? ' (brand/tokens.json не найден или без цветов)' : ''}. ` +
    `Мастер: куб ${master.fills.cube.join(', ')}, надпись ${master.fills.wordmark.join(', ')}. ` +
    '«≈» — ΔE2000 ≤ 2 к цвету палитры.', '');
  L.push('| Пакет | Композиция | Слой | Деталь | Цвета |', '|---|---|---|---|---|');
  for (const part of Object.keys(PARTS)) {
    for (const c of analysis[part].copies) {
      L.push(`| ${esc(c.slug)} | ${esc(compCell(c))} | ${esc(c.layer)} | ${PARTS[part]} | ${esc(colourCell(c.layerData, palette))} |`);
    }
  }
  L.push('');
  if (missing.length) {
    L.push('## Не найдено', '');
    for (const m of missing) L.push(`- ${m.slug} / ${m.comp}${m.layer ? ' / ' + m.layer : ''} (${m.part === '—' ? 'обе детали' : PARTS[m.part]}): ${m.reason}`);
    L.push('');
  }
  L.push('## Сводка', '');
  for (const part of Object.keys(PARTS)) {
    const a = analysis[part];
    const count = (v) => a.groups.filter((g) => g.verdict === v).reduce((s, g) => s + g.members.length, 0);
    L.push(`- ${PARTS[part]}: копий ${a.copies.length}, групп ${a.groups.length}; совпадают с мастером ${count('совпадает')}, близко ${count('близко')}, отличаются ${count('отличается')}.`);
  }
  L.push('');
  return L.join('\n');
}

function parseArgs(argv) {
  const val = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
  return {
    dumps: val('--dumps', workPath('dumps')),
    master: val('--master', path.join(REPO, 'brand', 'logo', 'master-ae-motion-live.svg')),
    tokens: val('--tokens', path.join(REPO, 'brand', 'tokens.json')),
    out: val('--out', path.join(REPO, 'docs', 'research', 'logo-geometry.md')),
    discover: !argv.includes('--no-discover'),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  const svgText = readFileSync(o.master, 'utf8');
  const master = masterParts(svgText);
  const bundles = loadDumpRoot(o.dumps);
  if (!bundles.length) { console.error('no dumps under ' + o.dumps + ' (run node tools/dump/dump.mjs --all first)'); process.exit(1); }
  const candidates = JSON.parse(readFileSync(path.join(here, 'logo-candidates.json'), 'utf8')).copies;
  const { copies, missing } = findCopies(bundles, candidates, { discover: o.discover });
  const analysis = analyse(copies, master);
  const palette = loadPalette(o.tokens);
  const md = renderReport(analysis, {
    missing, palette, master,
    meta: {
      date: new Date().toISOString().slice(0, 10), dumps: o.dumps,
      masterFile: path.relative(REPO, o.master).replace(/\\/g, '/'),
      masterSha: createHash('sha256').update(readFileSync(o.master)).digest('hex'),
    },
  });
  const svgDir = path.join(path.dirname(o.out), 'logo-geometry');
  rmSync(svgDir, { recursive: true, force: true });
  mkdirSync(svgDir, { recursive: true });
  for (const part of Object.keys(PARTS)) {
    for (const g of analysis[part].groups) {
      writeFileSync(path.join(svgDir, `${part}-${g.label}.svg`), overlaySvg(analysis[part].master, g.norm), 'utf8');
    }
  }
  writeFileSync(o.out, md, 'utf8');
  for (const part of Object.keys(PARTS)) {
    const a = analysis[part];
    console.log(`${part}: ${a.copies.length} copies, ${a.groups.length} groups: ` +
      a.groups.map((g) => `${g.label} x${g.members.length} max ${pm(g.toMaster.max)} permille ${g.verdict}`).join('; '));
  }
  console.log(`missing: ${missing.length}; written ${o.out} and ${svgDir}`);
}
