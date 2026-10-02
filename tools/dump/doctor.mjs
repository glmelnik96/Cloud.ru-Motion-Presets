#!/usr/bin/env node
// Pack doctor (spec 3.2): hygiene problems of one pack, from its JSX dump and the relink map.
//   node tools/dump/doctor.mjs --slug podcast [--dumps C:/CRBK/work/dumps] [--relink <relink-map.json>]
//                              [--tokens brand/tokens.json] [--out docs/research/packs]
//   node tools/dump/doctor.mjs --all
// Writes docs/research/packs/<slug>-doctor.md. Read-only: AE is not involved.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';
import { packDir } from '../packs/paths.mjs';
import { aeColorToHex, classify, layerColors, loadPalette } from './colors.mjs';
import { isNfd, layerProp, listDumpDirs, loadDumpDir, readJson, walkLayer } from './model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const CANON_FPS = 25; // D2
// Classic 3D: CompItem.renderer has long returned 'ADBE Advanced 3d' for it; audit_podcast.json decoded
// 'ADBE Escher' (Classic 3D) and 'ADBE Calder' (Advanced 3D) from the .aep files. The live fixture
// check (Task 6) prints the ids this AE reports.
export const CLASSIC_RENDERERS = ['ADBE Advanced 3d', 'ADBE Escher'];
export const RENDERER_NAMES = {
  'ADBE Advanced 3d': 'Classic 3D', 'ADBE Escher': 'Classic 3D', 'ADBE Calder': 'Advanced 3D',
  'ADBE Ernst': 'Cinema 4D', 'ADBE Picasso': 'Ray-traced 3D',
};
// Names AE gives by itself. The packs were built in the English UI; the Russian-UI names are a best guess.
export const UNNAMED_LAYER = [
  /^Shape Layer \d+$/, /^Pre-comp \d+$/, /^Precomp \d+$/, /^Comp \d+$/, /^Null \d+$/, /^Adjustment Layer \d+$/,
  /^Camera \d+$/, /^Light \d+$/, /^Layer \d+ Outlines( \d+)?$/, / Solid \d+$/,
  /^Слой-фигура \d+$/, /^Композиция \d+$/, /^Пред\S* композиция \d+$/, /^Нуль \d+$/, /^Корректирующий слой \d+$/,
];
export const UNNAMED_COMP = [/^Pre-comp \d+$/, /^Precomp \d+$/, /^Comp \d+$/, /^Composition \d+$/, /^Композиция \d+$/, /^Пред\S* композиция \d+$/];
export const STILL_NAME = /^(still\b|slide_)/i;
export const SLOT_NAME = /^SLOT_/;
const ROWS = 200;

// Tolerant reader: the relink map comes from Plan 2 (relinked copies); accepts [{from,to}], {entries|items|files: [...]}
// with from/src/source/original/old and to/dst/target/relinked/new keys, or a plain {from: to} object.
export function loadRelinkMap(file) {
  if (!file || !existsSync(file)) return { file, found: false, entries: [] };
  const raw = readJson(file);
  const list = Array.isArray(raw) ? raw : ['entries', 'items', 'files'].map((k) => raw[k]).find(Array.isArray);
  const pick = (e, keys) => { for (const k of keys) if (typeof e[k] === 'string') return e[k]; return null; };
  const entries = [];
  if (list) {
    for (const e of list) {
      if (!e || typeof e !== 'object') continue;
      const from = pick(e, ['from', 'src', 'source', 'original', 'old']);
      const to = pick(e, ['to', 'dst', 'target', 'relinked', 'new']);
      if (from || to) entries.push({ from, to });
    }
  } else if (raw && typeof raw === 'object') {
    for (const [from, to] of Object.entries(raw)) if (typeof to === 'string') entries.push({ from, to });
  }
  return { file, found: true, entries };
}

// "й" in NFD is "и" + U+0306: name the combining marks so the report shows why a name is NFD.
export function nfdMarks(s) {
  const marks = [...new Set([...String(s)].filter((ch) => /\p{M}/u.test(ch)).map((ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')))];
  return marks.join(', ');
}

const fpsKey = (v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : '?');
const firstLine = (s) => String(s || '').split(/\r\n|\r|\n/)[0].slice(0, 160);

function timeRemapIssues(node) {
  const issues = [];
  if (!node) return issues;
  if (node.expression) issues.push(`выражение: ${firstLine(node.expression.text).slice(0, 80)}`);
  const keys = (node.keys || []).filter((k) => typeof k.value === 'number');
  if (!keys.length) {
    if (!node.expression) issues.push(`без ключей: стоп-кадр ${node.value} с`);
    return issues;
  }
  if (keys.length === 1) issues.push(`один ключ: стоп-кадр ${keys[0].value} с`);
  for (let i = 0; i + 1 < keys.length; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (a.outInterp === 'HOLD') issues.push(`удержание ключом HOLD ${a.time}–${b.time} с`);
    else if (Math.abs(b.value - a.value) < 1e-6) issues.push(`удержание ${a.time}–${b.time} с (кадр ${a.value} с)`);
    else if (b.value < a.value) issues.push(`обратный ход ${a.time}–${b.time} с`);
  }
  return issues;
}

export function diagnose(bundle, { palette = loadPalette(null), relink = { found: false, entries: [] }, canonFps = CANON_FPS } = {}) {
  const items = (bundle.project && bundle.project.items) || [];
  const f = {
    slug: bundle.index.slug,
    project: bundle.index.file || (bundle.project && bundle.project.file) || '',
    aeVersion: bundle.index.aeVersion || '',
    engine: { value: (bundle.project && bundle.project.expressionEngine) || bundle.index.expressionEngine || null, expressions: 0, errors: [] },
    renderers: {}, advanced3d: [], nfd: [], unnamed: [], unnamedComps: [], audio: [], missing: [],
    fps: { comps: {}, offCanon: [], nested: [], footage: [] },
    colors: { list: [], bg: {}, gradients: [], skippedDefaults: 0 },
    stills: [], stillsHidden: 0, outsideSlots: [], timeRemap: [], negativeStretch: [], relink,
  };
  f.engine.legacy = f.engine.value === 'extendscript';

  for (const it of items) {
    if (it.source && it.source.missing === true) f.missing.push({ name: it.name, file: it.source.file || '' });
    if (isNfd(it.name)) f.nfd.push({ where: 'элемент проекта', name: it.name, detail: it.folder || '' });
    if (it.source && isNfd(it.source.file)) f.nfd.push({ where: 'путь футажа', name: it.source.file, detail: it.name });
    if (it.kind === 'comp' && UNNAMED_COMP.some((re) => re.test(it.name))) f.unnamedComps.push({ name: it.name, folder: it.folder || '' });
    const s = it.source;
    if (it.kind === 'footage' && s && s.kind === 'file' && s.hasVideo && !s.isStill && typeof s.frameRate === 'number' &&
        Math.abs(s.frameRate - canonFps) > 1e-3) {
      f.fps.footage.push({ name: it.name, fps: s.frameRate, file: s.file });
    }
  }
  for (const e of relink.entries) {
    if (isNfd(e.from)) f.nfd.push({ where: 'карта перелинковки, было', name: e.from, detail: e.to || '' });
    if (isNfd(e.to)) f.nfd.push({ where: 'карта перелинковки, стало', name: e.to, detail: e.from || '' });
  }

  const colorMap = new Map();
  const slotFiles = new Map();
  for (const d of bundle.comps) {
    const c = d.comp;
    const ren = c.renderer || '?';
    f.renderers[ren] = (f.renderers[ren] || 0) + 1;
    if (c.renderer && !CLASSIC_RENDERERS.includes(c.renderer)) {
      f.advanced3d.push({ comp: c.name, renderer: c.renderer, rendererName: RENDERER_NAMES[c.renderer] || 'не Classic 3D',
        threeDLayers: d.layers.filter((l) => l.switches && l.switches.threeDLayer).length });
    }
    const k = fpsKey(c.frameRate);
    f.fps.comps[k] = (f.fps.comps[k] || 0) + 1;
    if (typeof c.frameRate === 'number' && Math.abs(c.frameRate - canonFps) > 1e-3) f.fps.offCanon.push({ comp: c.name, fps: c.frameRate });
    if (Array.isArray(c.bgColor)) {
      const bg = aeColorToHex(c.bgColor);
      f.colors.bg[bg] = (f.colors.bg[bg] || 0) + 1;
    }
    for (const l of d.layers) {
      const sw = l.switches || {};
      const src = l.source || null;
      const where = `${c.name} › ${l.name}`;
      if (isNfd(l.name)) f.nfd.push({ where: 'слой', name: l.name, detail: c.name });
      if (UNNAMED_LAYER.some((re) => re.test(l.name || ''))) f.unnamed.push({ comp: c.name, index: l.index, name: l.name, type: l.type });
      if (src && src.kind === 'comp' && typeof src.frameRate === 'number' && typeof c.frameRate === 'number' &&
          Math.abs(src.frameRate - c.frameRate) > 1e-3) {
        f.fps.nested.push({ comp: c.name, fps: c.frameRate, layer: l.name, sourceFps: src.frameRate });
      }
      if (src && src.kind === 'file') {
        if (src.hasAudio === true) {
          f.audio.push({ comp: c.name, layer: l.name, file: src.file || src.name, audioEnabled: sw.audioEnabled !== false, video: src.hasVideo === true });
        }
        if (STILL_NAME.test(l.name || '') || STILL_NAME.test(src.name || '')) {
          if (sw.enabled !== false && sw.guideLayer !== true) f.stills.push({ comp: c.name, layer: l.name, file: src.file || src.name });
          else f.stillsHidden += 1;
        }
        if (src.hasVideo !== false && !SLOT_NAME.test(l.name || '') && sw.guideLayer !== true) {
          const key = src.file || src.name;
          if (!slotFiles.has(key)) slotFiles.set(key, { file: key, layers: 0, comps: new Set() });
          const e = slotFiles.get(key);
          e.layers += 1;
          e.comps.add(c.name);
        }
      }
      if (typeof l.stretch === 'number' && l.stretch < 0) f.negativeStretch.push({ comp: c.name, layer: l.name, stretch: l.stretch });
      if (sw.timeRemapEnabled === true) {
        const issues = timeRemapIssues(layerProp(l, 'ADBE Time Remapping'));
        if (issues.length) f.timeRemap.push({ comp: c.name, layer: l.name, issues });
      }
      for (const { node, trail } of walkLayer(l)) {
        if (!node.expression) continue;
        f.engine.expressions += 1;
        if (node.expression.error) f.engine.errors.push({ comp: c.name, layer: l.name, where: trail.join(' › '), error: firstLine(node.expression.error) });
      }
      const { colors, skippedDefaults } = layerColors(l);
      f.colors.skippedDefaults += skippedDefaults;
      for (const col of colors) {
        if (!col.hex) { f.colors.gradients.push({ where, label: col.label }); continue; }
        if (!colorMap.has(col.hex)) colorMap.set(col.hex, { hex: col.hex, uses: 0, hidden: 0, kinds: new Set(), examples: [] });
        const e = colorMap.get(col.hex);
        if (col.off) e.hidden += 1; else e.uses += 1;
        e.kinds.add(col.kind);
        if (e.examples.length < 3 && !e.examples.includes(where)) e.examples.push(where);
      }
    }
  }
  f.colors.list = [...colorMap.values()]
    .map((e) => ({ ...e, kinds: [...e.kinds].sort(), ...classify(e.hex, palette) }))
    .sort((a, b) => b.uses - a.uses || a.hex.localeCompare(b.hex));
  f.outsideSlots = [...slotFiles.values()].map((e) => ({ file: e.file, layers: e.layers, comps: [...e.comps] }))
    .sort((a, b) => b.layers - a.layers || String(a.file).localeCompare(String(b.file)));
  f.palette = palette;
  return f;
}

const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function table(L, head, rows) {
  L.push('| ' + head.join(' | ') + ' |', '|' + head.map(() => '---|').join(''));
  for (const r of rows.slice(0, ROWS)) L.push('| ' + r.map(esc).join(' | ') + ' |');
  if (rows.length > ROWS) L.push('', `… и ещё ${rows.length - ROWS}.`);
  L.push('');
}

export function renderDoctor(f, { date = new Date().toISOString().slice(0, 10), dumpDir = '' } = {}) {
  const off = f.colors.list.filter((c) => c.status === 'off');
  const near = f.colors.list.filter((c) => c.status === 'near');
  const fpsList = Object.entries(f.fps.comps).sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([k, n]) => `${k} fps × ${n}`).join(', ') || '—';
  const L = [`# Доктор пакета: ${f.slug}`, ''];
  L.push(`Собрано командой \`node tools/dump/doctor.mjs --slug ${f.slug}\` ${date} из \`${dumpDir}\` (проект \`${f.project}\`, AE ${f.aeVersion}); руками не править.`, '');
  L.push(f.relink.found
    ? `Карта перелинковки: \`${f.relink.file}\`, записей ${f.relink.entries.length}.`
    : `Карта перелинковки не найдена (\`${f.relink.file || '—'}\`): NFD в исходных путях не проверены.`, '');
  L.push(`Палитра: ${f.palette.source}.`, '');
  L.push('| Проверка | Найдено |', '|---|---|');
  L.push(`| Пропавший футаж | ${f.missing.length} |`);
  L.push(`| Движок выражений | ${f.engine.value || '?'}${f.engine.legacy ? ' (устаревший)' : ''}; выражений ${f.engine.expressions}, с ошибкой ${f.engine.errors.length} |`);
  L.push(`| Не Classic 3D | ${f.advanced3d.length} комп. |`);
  L.push(`| Имена в NFD | ${f.nfd.length} |`);
  L.push(`| Безымянные слои / композиции | ${f.unnamed.length} / ${f.unnamedComps.length} |`);
  L.push(`| Звук в композициях | ${f.audio.length} слоёв |`);
  L.push(`| Частоты кадров | ${fpsList}; не ${CANON_FPS} fps: композиций ${f.fps.offCanon.length}, вложений с другой частотой ${f.fps.nested.length}, видеофутажа ${f.fps.footage.length} |`);
  L.push(`| Цвета вне палитры | ${off.length} (почти в палитре: ${near.length}) |`);
  L.push(`| Видимые опорные кадры | ${f.stills.length} (скрытых или guide: ${f.stillsHidden}) |`);
  L.push(`| Футаж вне слотов | файлов ${f.outsideSlots.length}, слоёв ${f.outsideSlots.reduce((s, e) => s + e.layers, 0)} |`);
  L.push(`| Удержания и стоп-кадры time remap | ${f.timeRemap.length} слоёв |`);
  L.push(`| Отрицательное растяжение | ${f.negativeStretch.length} слоёв |`, '');

  if (f.missing.length) {
    L.push('## Пропавший футаж', '', 'В рабочей копии пропавших файлов быть не должно (задачи 1–5).', '');
    table(L, ['Элемент', 'Путь'], f.missing.map((m) => [m.name, m.file]));
  }

  L.push('## Движок выражений', '');
  L.push(`Проект: \`${f.engine.value}\`. ${f.engine.legacy ? 'Устаревший ExtendScript: шаблоны собираются под JavaScript и проверяются в обоих движках (§4.2).' : ''}`, '');
  if (f.engine.errors.length) table(L, ['Композиция', 'Слой', 'Свойство', 'Ошибка'], f.engine.errors.map((e) => [e.comp, e.layer, e.where, e.error]));

  L.push('## Не Classic 3D', '');
  L.push(`Рендереры по композициям: ${Object.entries(f.renderers).map(([k, n]) => `\`${k}\` × ${n}`).join(', ') || '—'}.`, '');
  if (f.advanced3d.length && f.advanced3d.length === Object.values(f.renderers).reduce((s, n) => s + n, 0)) {
    L.push('Внимание: не Classic 3D оказались все композиции — проверьте `CLASSIC_RENDERERS` в `tools/dump/doctor.mjs` по выводу задачи 6.', '');
  }
  if (f.advanced3d.length) table(L, ['Композиция', 'Рендерер', 'Слоёв 3D'], f.advanced3d.map((a) => [a.comp, `${a.rendererName} (\`${a.renderer}\`)`, a.threeDLayers]));

  L.push('## Имена в NFD', '');
  if (f.nfd.length) table(L, ['Где', 'Имя', 'Знаки', 'Контекст'], f.nfd.map((n) => [n.where, n.name, nfdMarks(n.name), n.detail]));
  else L.push('Не найдено.', '');

  L.push('## Безымянные слои и композиции', '');
  if (f.unnamedComps.length) table(L, ['Композиция', 'Папка'], f.unnamedComps.map((u) => [u.name, u.folder]));
  if (f.unnamed.length) table(L, ['Композиция', '#', 'Слой', 'Тип'], f.unnamed.map((u) => [u.comp, u.index, u.name, u.type]));
  if (!f.unnamed.length && !f.unnamedComps.length) L.push('Не найдено.', '');

  L.push('## Звук в композициях', '');
  if (f.audio.length) table(L, ['Композиция', 'Слой', 'Файл', 'Звук включён', 'Есть видео'], f.audio.map((a) => [a.comp, a.layer, a.file, a.audioEnabled ? 'да' : 'нет', a.video ? 'да' : 'нет']));
  else L.push('Не найдено.', '');

  L.push('## Частоты кадров', '');
  L.push(`Композиции: ${fpsList}. Канон D2 — ${CANON_FPS} fps.`, '');
  if (f.fps.offCanon.length) table(L, ['Композиция', 'fps'], f.fps.offCanon.map((x) => [x.comp, x.fps]));
  if (f.fps.nested.length) table(L, ['Композиция', 'fps', 'Вложенная', 'Её fps'], f.fps.nested.map((x) => [x.comp, x.fps, x.layer, x.sourceFps]));
  if (f.fps.footage.length) table(L, ['Футаж', 'fps', 'Файл'], f.fps.footage.map((x) => [x.name, x.fps, x.file]));

  L.push('## Цвета', '');
  L.push(`«≈» — ΔE2000 ≤ 2 к цвету палитры. Цвета эффектов, не менявшиеся с создания, пропущены: ${f.colors.skippedDefaults}.`, '');
  const colorRows = (list) => list.map((c) => [c.hex, c.nearest, c.dE, c.kinds.join(', '), c.uses, c.hidden, c.examples.join('; ')]);
  if (off.length) { L.push('### Вне палитры', ''); table(L, ['Цвет', 'Ближайший', 'ΔE00', 'Где', 'Видимых', 'Скрытых', 'Примеры'], colorRows(off)); }
  if (near.length) { L.push('### Почти в палитре', ''); table(L, ['Цвет', 'Ближайший', 'ΔE00', 'Где', 'Видимых', 'Скрытых', 'Примеры'], colorRows(near)); }
  if (!off.length && !near.length) L.push('Все цвета из палитры.', '');
  L.push(`Фоны композиций: ${Object.entries(f.colors.bg).map(([h, n]) => `${h} × ${n}`).join(', ') || '—'} (рендерятся только без альфы).`, '');
  if (f.colors.gradients.length) {
    L.push(`Градиенты (цвета скриптом не читаются, сверить вручную): ${f.colors.gradients.slice(0, 20).map((g) => `${g.where} (${g.label})`).join('; ')}.`, '');
  }

  L.push('## Видимые опорные кадры', '');
  if (f.stills.length) table(L, ['Композиция', 'Слой', 'Файл'], f.stills.map((s) => [s.comp, s.layer, s.file]));
  else L.push('Не найдено.', '');

  L.push('## Футаж вне слотов', '');
  L.push('Слоты — слои `SLOT_*` (контракт §4.2); guide-слои не считаются.', '');
  if (f.outsideSlots.length) table(L, ['Файл', 'Слоёв', 'Композиции'], f.outsideSlots.map((s) => [s.file, s.layers, s.comps.slice(0, 5).join('; ') + (s.comps.length > 5 ? ` и ещё ${s.comps.length - 5}` : '')]));
  else L.push('Не найдено.', '');

  L.push('## Удержания time remap и отрицательное растяжение', '');
  if (f.timeRemap.length) table(L, ['Композиция', 'Слой', 'Что'], f.timeRemap.map((t) => [t.comp, t.layer, t.issues.join('; ')]));
  if (f.negativeStretch.length) table(L, ['Композиция', 'Слой', 'Растяжение, %'], f.negativeStretch.map((n) => [n.comp, n.layer, n.stretch]));
  if (!f.timeRemap.length && !f.negativeStretch.length) L.push('Не найдено.', '');
  return L.join('\n');
}

function parseArgs(argv) {
  const val = (flag, d) => { const i = argv.indexOf(flag); return i === -1 ? d : argv[i + 1]; };
  return {
    slug: val('--slug', null), all: argv.includes('--all'),
    dumps: val('--dumps', workPath('dumps')), relink: val('--relink', null),
    tokens: val('--tokens', path.join(REPO, 'brand', 'tokens.json')),
    out: val('--out', path.join(REPO, 'docs', 'research', 'packs')),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  if (!o.all && !o.slug) { console.error('usage: node tools/dump/doctor.mjs --slug <slug> | --all [--dumps dir] [--relink file] [--tokens file] [--out dir]'); process.exit(2); }
  const dirs = o.all ? listDumpDirs(o.dumps) : [path.join(o.dumps, o.slug)];
  const palette = loadPalette(o.tokens);
  mkdirSync(o.out, { recursive: true });
  for (const dir of dirs) {
    const b = loadDumpDir(dir); // one pack in memory at a time
    const slug = b.index.slug;
    const relinkFile = o.relink && !o.all ? o.relink : path.posix.join(packDir(slug), 'relink-map.json');
    const f = diagnose(b, { palette, relink: loadRelinkMap(relinkFile) });
    const file = path.join(o.out, `${slug}-doctor.md`);
    writeFileSync(file, renderDoctor(f, { dumpDir: b.dir.replace(/\\/g, '/') }), 'utf8');
    console.log(`${slug}: engine ${f.engine.value}, not classic ${f.advanced3d.length}, nfd ${f.nfd.length}, unnamed ${f.unnamed.length}, ` +
      `audio ${f.audio.length}, off-canon fps ${f.fps.offCanon.length}, off-palette ${f.colors.list.filter((c) => c.status === 'off').length}, ` +
      `stills ${f.stills.length}, footage files ${f.outsideSlots.length}, time remap ${f.timeRemap.length}, negative stretch ${f.negativeStretch.length} -> ${file}`);
  }
}
