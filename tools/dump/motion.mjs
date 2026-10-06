#!/usr/bin/env node
// Motion of the packs from the JSX dumps of phase 1 (D19 «Канон движения»: the numbers of the curves and
// timings go into brand/tokens.json from these dumps). Every animated property gives one segment per pair of
// neighbouring keys: what moves (the kind of property), how long (seconds and frames), how far, and how — the
// interpolation and the temporal ease of AE (speed, influence) turned into the cubic-bezier it draws. Motion
// driven by expressions (wiggle, loopOut, time*k) is listed apart. The summary groups the segments by kind and
// counts the curves that repeat.
//   node tools/dump/motion.mjs [--dumps <work>/dumps] [--out docs/research/motion]
// Writes segments.json.gz (every segment), expressions.json, summary.json and summary.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { workPath } from '../lib/work.mjs';
import { loadDumpRoot, walkLayer } from './model.mjs';

const r = (v, d = 3) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);

// What a property is, for grouping: transform, text animators and selectors, masks, shape paths, effects.
const KINDS = {
  'ADBE Position': 'position', 'ADBE Position_0': 'position.x', 'ADBE Position_1': 'position.y', 'ADBE Position_2': 'position.z',
  'ADBE Anchor Point': 'anchor', 'ADBE Scale': 'scale', 'ADBE Rotate Z': 'rotation', 'ADBE Rotate X': 'rotation.x', 'ADBE Rotate Y': 'rotation.y',
  'ADBE Orientation': 'orientation', 'ADBE Opacity': 'opacity',
  'ADBE Text Percent Start': 'text.selector', 'ADBE Text Percent End': 'text.selector', 'ADBE Text Percent Offset': 'text.selector',
  'ADBE Text Index Start': 'text.selector', 'ADBE Text Index End': 'text.selector', 'ADBE Text Index Offset': 'text.selector',
  'ADBE Text Position 3D': 'text.position', 'ADBE Text Scale 3D': 'text.scale', 'ADBE Text Opacity': 'text.opacity',
  'ADBE Text Rotation': 'text.rotation', 'ADBE Text Tracking Amount': 'text.tracking', 'ADBE Text Blur': 'text.blur',
  'ADBE Mask Shape': 'mask.path', 'ADBE Mask Offset': 'mask.expansion', 'ADBE Mask Feather': 'mask.feather', 'ADBE Mask Opacity': 'mask.opacity',
  'ADBE Vector Shape': 'shape.path', 'ADBE Vector Rect Size': 'shape.size', 'ADBE Vector Rect Roundness': 'shape.roundness',
  'ADBE Vector Ellipse Size': 'shape.size', 'ADBE Vector Trim Start': 'shape.trim', 'ADBE Vector Trim End': 'shape.trim',
  'ADBE Vector Trim Offset': 'shape.trim', 'ADBE Vector Stroke Width': 'shape.strokeWidth', 'ADBE Vector Position': 'shape.position',
  'ADBE Vector Scale': 'shape.scale', 'ADBE Vector Rotation': 'shape.rotation', 'ADBE Vector Group Opacity': 'shape.opacity',
  'ADBE Time Remapping': 'timeRemap',
};

export function propKind(matchName, area, effect) {
  if (area === 'effect' && effect) return `effect:${effect.matchName}`;
  return KINDS[matchName] ?? `other:${matchName}`;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec = (v) => Array.isArray(v) && v.length > 0 && v.every(isNum);

// How far a pair of keys moves: the change of a number, or of the dimension that moves most (its ease is the
// one AE keeps per dimension for scale and the like); spatial properties move along one path, ease index 0.
export function change(v0, v1, pvt) {
  if (isNum(v0) && isNum(v1)) return { delta: v1 - v0, dim: 0, magnitude: Math.abs(v1 - v0) };
  if (isVec(v0) && isVec(v1) && v0.length === v1.length) {
    const d = v0.map((x, i) => v1[i] - x);
    const magnitude = Math.hypot(...d);
    if (pvt === 'TwoD_SPATIAL' || pvt === 'ThreeD_SPATIAL') return { delta: magnitude, dim: 0, magnitude, vector: d };
    let dim = 0;
    d.forEach((x, i) => { if (Math.abs(x) > Math.abs(d[dim])) dim = i; });
    return { delta: d[dim], dim, magnitude, vector: d };
  }
  return null;
}

// The cubic-bezier (x1, y1, x2, y2) of a key pair in AE terms: the outgoing ease of the first key and the
// incoming ease of the second; speed is in units per second, influence in percent of the segment. A linear side
// is the straight third; hold has no curve. y outside 0..1 is an overshoot.
export function toBezier({ dur, delta, out, inn, outInterp, inInterp }) {
  if (outInterp === 'HOLD') return { hold: true };
  if (!(dur > 0) || !delta) return null;
  const avg = Math.abs(delta) / dur;
  const sign = Math.sign(delta);
  const side = (ease, interp, first) => {
    if (interp === 'LINEAR' || !ease) return first ? [1 / 3, 1 / 3] : [2 / 3, 2 / 3];
    const x = Math.min(1, Math.max(0.0001, (ease.influence ?? 16.666667) / 100));
    const k = ((ease.speed ?? 0) * sign) / avg;
    return first ? [x, k * x] : [1 - x, 1 - k * x];
  };
  const [x1, y1] = side(out, outInterp, true);
  const [x2, y2] = side(inn, inInterp, false);
  return { x1: r(x1), y1: r(y1), x2: r(x2), y2: r(y2) };
}

const easeAt = (list, dim) => (Array.isArray(list) && list.length ? list[Math.min(dim, list.length - 1)] : null);

// Every segment of one comp dump.
export function* segmentsOfComp(dump, meta = {}) {
  const fps = dump.comp?.frameRate || 25;
  for (const layer of dump.layers ?? []) {
    if (layer.error) continue;
    for (const { node, trail, area, effect, off } of walkLayer(layer)) {
      const keys = (node.keys ?? []).filter((k) => k && !k.error && typeof k.time === 'number');
      if (keys.length < 2) continue;
      const kind = propKind(node.matchName, area, effect);
      for (let i = 0; i + 1 < keys.length; i += 1) {
        const k0 = keys[i];
        const k1 = keys[i + 1];
        const dur = k1.time - k0.time;
        const c = change(k0.value, k1.value, node.pvt);
        const seg = {
          pack: meta.pack ?? null, comp: dump.comp?.name ?? null, fps, layer: layer.name, layerType: layer.type,
          kind, matchName: node.matchName, trail: trail.join(' / '), off: off || layer.switches?.enabled === false,
          t0: r(k0.time), t1: r(k1.time), dur: r(dur), frames: r(dur * fps, 2),
          outInterp: k0.outInterp ?? null, inInterp: k1.inInterp ?? null,
          expression: Boolean(node.expression && node.expression.enabled),
        };
        if (c) {
          seg.v0 = Array.isArray(k0.value) ? k0.value.map((v) => r(v)) : r(k0.value);
          seg.v1 = Array.isArray(k1.value) ? k1.value.map((v) => r(v)) : r(k1.value);
          seg.delta = r(c.delta);
          seg.magnitude = r(c.magnitude);
          const out = easeAt(k0.outEase, c.dim);
          const inn = easeAt(k1.inEase, c.dim);
          seg.ease = { outSpeed: r(out?.speed), outInfluence: r(out?.influence), inSpeed: r(inn?.speed), inInfluence: r(inn?.influence) };
          seg.bezier = toBezier({ dur, delta: c.delta, out, inn, outInterp: seg.outInterp, inInterp: seg.inInterp });
          if (seg.bezier && !seg.bezier.hold) seg.overshoot = seg.bezier.y1 > 1.001 || seg.bezier.y1 < -0.001 || seg.bezier.y2 > 1.001 || seg.bezier.y2 < -0.001;
        } else {
          seg.valueKind = node.pvt ?? 'unknown';
          seg.bezier = seg.outInterp === 'HOLD' ? { hold: true } : null;
        }
        yield seg;
      }
    }
  }
}

const PATTERNS = { wiggle: /wiggle\s*\(/, loopOut: /loopOut\s*\(/, loopIn: /loopIn\s*\(/, time: /\btime\s*\*/, valueAtTime: /valueAtTime\s*\(/, linear: /\blinear\s*\(/, ease: /\bease(In|Out)?\s*\(/, random: /\b(random|gaussRandom|noise)\s*\(/, posterize: /posterizeTime\s*\(/ };

// Properties driven by expressions: the motion that has no keys (drift, flicker, loops).
export function* expressionsOfComp(dump, meta = {}) {
  for (const layer of dump.layers ?? []) {
    if (layer.error) continue;
    for (const { node, trail, area, effect } of walkLayer(layer)) {
      const e = node.expression;
      if (!e || !e.text) continue;
      const text = String(e.text);
      yield {
        pack: meta.pack ?? null, comp: dump.comp?.name ?? null, layer: layer.name, kind: propKind(node.matchName, area, effect),
        matchName: node.matchName, trail: trail.join(' / '), enabled: e.enabled !== false, error: e.error || '',
        patterns: Object.entries(PATTERNS).filter(([, re]) => re.test(text)).map(([k]) => k),
        text: text.length > 400 ? `${text.slice(0, 400)}…` : text,
      };
    }
  }
}

const quant = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return r(s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))], 2);
};
const curveKey = (b) => `${b.x1.toFixed(2)},${b.y1.toFixed(2)},${b.x2.toFixed(2)},${b.y2.toFixed(2)}`;

// Per kind: how many segments, in which packs, how long, and the curves that repeat (rounded to 0.01).
export function summarize(segments, { top = 8 } = {}) {
  const kinds = {};
  for (const s of segments) {
    if (s.off) continue;
    const k = (kinds[s.kind] ??= { count: 0, packs: {}, frames: [], curves: new Map(), hold: 0, linear: 0, overshoot: 0 });
    k.count += 1;
    k.packs[s.pack] = (k.packs[s.pack] ?? 0) + 1;
    k.frames.push(s.frames);
    if (s.bezier?.hold) k.hold += 1;
    if (s.outInterp === 'LINEAR' && s.inInterp === 'LINEAR') k.linear += 1;
    if (s.overshoot) k.overshoot += 1;
    if (s.bezier && !s.bezier.hold) {
      const key = curveKey(s.bezier);
      const c = k.curves.get(key) ?? { curve: key, count: 0, packs: {}, examples: [] };
      c.count += 1;
      c.packs[s.pack] = (c.packs[s.pack] ?? 0) + 1;
      if (c.examples.length < 3) c.examples.push(`${s.pack} / ${s.comp} / ${s.layer} (${s.frames} кадр.)`);
      k.curves.set(key, c);
    }
  }
  const out = {};
  for (const [kind, k] of Object.entries(kinds).sort((a, b) => b[1].count - a[1].count)) {
    out[kind] = {
      count: k.count, packs: k.packs, hold: k.hold, linear: k.linear, overshoot: k.overshoot,
      frames: { p10: quant(k.frames, 0.1), p50: quant(k.frames, 0.5), p90: quant(k.frames, 0.9) },
      topCurves: [...k.curves.values()].sort((a, b) => b.count - a.count).slice(0, top),
    };
  }
  return out;
}

export function toMarkdown(summary, expressions) {
  const lines = ['# Движение пакетов по JSX-дампам (D19)', '', 'Отрезок — пара соседних ключей одного свойства. Кривая — cubic-bezier (x1, y1, x2, y2) из скорости и влияния ключей AE, округлено до 0,01; y вне 0…1 — перелёт.', ''];
  for (const [kind, k] of Object.entries(summary)) {
    lines.push(`## ${kind} — ${k.count} отр.`, '', `Пакеты: ${Object.entries(k.packs).map(([p, n]) => `${p} ${n}`).join(', ')}. Кадров: p10 ${k.frames.p10}, медиана ${k.frames.p50}, p90 ${k.frames.p90}. Линейных ${k.linear}, hold ${k.hold}, с перелётом ${k.overshoot}.`, '');
    if (k.topCurves.length) {
      lines.push('| Кривая | Отрезков | Пакеты | Примеры |', '|---|---|---|---|');
      for (const c of k.topCurves) lines.push(`| ${c.curve} | ${c.count} | ${Object.keys(c.packs).join(', ')} | ${c.examples.join('; ')} |`);
      lines.push('');
    }
  }
  const byPattern = {};
  for (const e of expressions) for (const p of e.patterns.length ? e.patterns : ['other']) byPattern[p] = (byPattern[p] ?? 0) + 1;
  lines.push('## Выражения', '', Object.entries(byPattern).map(([p, n]) => `${p}: ${n}`).join(', ') || 'нет', '');
  return lines.join('\n') + '\n';
}

export function extractMotion(dumpRoot) {
  const segments = [];
  const expressions = [];
  const packs = [];
  for (const d of loadDumpRoot(dumpRoot)) {
    const pack = path.basename(d.dir);
    // properties the dumper cut at its key limit (caps.maxKeys): their tail is not in the segments
    const truncated = d.comps.flatMap((c) => (c.truncated ?? []).filter((t) => t.what === 'keys').map((t) => `${c.comp?.name}: ${t.path} (${t.count})`));
    packs.push({ pack, comps: d.comps.length, truncatedKeys: truncated });
    for (const c of d.comps) {
      for (const s of segmentsOfComp(c, { pack })) segments.push(s);
      for (const e of expressionsOfComp(c, { pack })) expressions.push(e);
    }
  }
  return { packs, segments, expressions, summary: summarize(segments) };
}

export function writeMotion(result, outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'segments.json.gz'), gzipSync(JSON.stringify(result.segments)));
  writeFileSync(path.join(outDir, 'expressions.json'), JSON.stringify(result.expressions, null, 1) + '\n', 'utf8');
  writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ generated: new Date().toISOString(), packs: result.packs, segments: result.segments.length, expressions: result.expressions.length, kinds: result.summary }, null, 1) + '\n', 'utf8');
  writeFileSync(path.join(outDir, 'summary.md'), toMarkdown(result.summary, result.expressions), 'utf8');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const res = extractMotion(opt('--dumps', workPath('dumps')));
  const out = opt('--out', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/research/motion'));
  writeMotion(res, out);
  console.log(`OK ${res.packs.length} packs, ${res.segments.length} segments, ${res.expressions.length} expressions -> ${out}`);
}
