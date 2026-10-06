#!/usr/bin/env node
// Every comp of the packs from the JSX dumps, for planning the masters of phase 2: size, fps, duration, work
// area, markers (intro and outro cues), text layers (the fields a master will expose), precomps it nests, whether
// it is a root (used by no other comp) and whether it already has Essential Graphics.
//   node tools/dump/comps.mjs [--dumps <work>/dumps] [--out docs/research/inventory]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';
import { layerProp, loadDumpRoot } from './model.mjs';

const r = (v, d = 3) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);

export function compRecord(dump, pack) {
  const c = dump.comp ?? {};
  const layers = (dump.layers ?? []).filter((l) => !l.error);
  const texts = layers.filter((l) => l.type === 'text').map((l) => {
    const st = layerProp(l, 'ADBE Text Properties', 'ADBE Text Document');
    const d = st?.value ?? st?.keys?.find((k) => k && k.value)?.value ?? null;
    return { layer: l.name, text: String(d?.text ?? '').replace(/\s+/g, ' ').slice(0, 60), font: d?.fontObject?.postScriptName ?? d?.font ?? null, size: r(d?.fontSize, 1) };
  });
  return {
    pack, name: c.name, folder: c.folder ?? null, w: c.width, h: c.height, fps: r(c.frameRate, 3), duration: r(c.duration),
    workArea: c.workAreaDuration !== undefined ? [r(c.workAreaStart), r(c.workAreaStart + c.workAreaDuration)] : null,
    root: Array.isArray(c.usedIn) ? c.usedIn.length === 0 : null,
    usedIn: Array.isArray(c.usedIn) ? c.usedIn.length : null,
    egp: c.mgtName ? { name: c.mgtName, controllers: c.mgtControllerCount ?? null } : null,
    markers: (c.markers ?? []).map((m) => ({ time: r(m.time), comment: m.comment ?? '' })),
    layers: layers.length,
    texts,
    precomps: [...new Set(layers.filter((l) => l.source?.kind === 'comp').map((l) => l.source.name))],
    threeD: layers.some((l) => l.switches?.threeDLayer),
    expressions: dump.stats?.expressions ?? null,
  };
}

export function extractComps(dumpRoot) {
  const comps = [];
  for (const d of loadDumpRoot(dumpRoot)) {
    const pack = path.basename(d.dir);
    for (const c of d.comps) comps.push(compRecord(c, pack));
  }
  return comps;
}

export function compsMarkdown(comps) {
  const lines = ['# Композиции пакетов (по JSX-дампам)', '', 'Корневая — не вложена в другие. Поля — текстовые слои. EG — Essential Graphics.', '', '| Пакет | Композиция | Кадр | fps | Длит., с | Корн. | EG | Маркеры | Поля |', '|---|---|---|---|---|---|---|---|---|'];
  for (const c of comps) {
    lines.push(`| ${c.pack} | ${c.name} | ${c.w}×${c.h} | ${c.fps} | ${c.duration} | ${c.root ? 'да' : ''} | ${c.egp ? `${c.egp.controllers ?? '?'}` : ''} | ${c.markers.map((m) => `${m.time}${m.comment ? ` ${m.comment}` : ''}`).join('; ')} | ${c.texts.map((t) => t.layer).join(', ')} |`);
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const comps = extractComps(opt('--dumps', workPath('dumps')));
  const out = opt('--out', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/research/inventory'));
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'comps.json'), JSON.stringify(comps, null, 1) + '\n', 'utf8');
  writeFileSync(path.join(out, 'comps.md'), compsMarkdown(comps), 'utf8');
  console.log(`OK ${comps.length} comps (${comps.filter((c) => c.root).length} roots) -> ${out}`);
}
