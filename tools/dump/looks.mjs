#!/usr/bin/env node
// The looks of the packs from the JSX dumps of phase 1, for the masters of phase 2 and for what phase 3 still
// waits for: the blur of the podcast fields (D11) and the subtitle style «CR Субтитры» (D25).
//   effects      every effect by matchName: how often, in which packs, its static parameters in the first places
//   blurs        every blur with all its parameters, layer type (adjustment or not) and place
//   text-styles  every text style (font, size, tracking, leading, fill, stroke, caps, box) with its places
//   fonts        fonts per pack from project.json
//   node tools/dump/looks.mjs [--dumps <work>/dumps] [--out docs/research/looks]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';
import { layerProp, loadDumpRoot, walkNodes } from './model.mjs';

const r = (v, d = 3) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : Array.isArray(v) ? v.map((x) => r(x, d)) : v);

// Parameters of an effect: the static value, or «keyed n» and the first and last key values.
export function effectParams(fx) {
  const out = {};
  for (const { node, trail } of walkNodes(fx.params)) {
    if (node.children || node.pvt === 'NO_VALUE' || node.custom) continue;
    const name = trail.join(' / ');
    if (Array.isArray(node.keys) && node.keys.length) {
      const vals = node.keys.filter((k) => 'value' in k).map((k) => r(k.value));
      out[name] = { keyed: node.keys.length, first: vals[0], last: vals.at(-1) };
    } else if ('value' in node) out[name] = r(node.value);
    if (node.expression?.text) out[`${name} (expression)`] = String(node.expression.text).slice(0, 200);
  }
  return out;
}

const BLUR = /blur/i;

// The masks of a layer as a blur needs them (the podcast blurs only the fields outside an inverted rectangle):
// mode, inverted, feather, expansion, opacity and the box of the path (its first key when it moves).
export function masksOf(layer) {
  return (layer.masks ?? []).filter((m) => !m.error).map((m) => {
    const shape = m.path?.value ?? m.path?.keys?.find((k) => k && k.value)?.value ?? null;
    const v = Array.isArray(shape?.vertices) ? shape.vertices : [];
    const xs = v.map((p) => p[0]);
    const ys = v.map((p) => p[1]);
    return {
      name: m.name, mode: m.mode ?? null, inverted: m.inverted === true,
      feather: r(m.feather?.value ?? null), expansion: r(m.expansion?.value ?? null), opacity: r(m.opacity?.value ?? null),
      keyed: Array.isArray(m.path?.keys) && m.path.keys.length > 0,
      vertices: v.length, closed: shape?.closed ?? null,
      box: v.length ? { left: r(Math.min(...xs), 1), top: r(Math.min(...ys), 1), right: r(Math.max(...xs), 1), bottom: r(Math.max(...ys), 1) } : null,
    };
  });
}

export function looksOfComp(dump, pack) {
  const effects = [];
  const texts = [];
  for (const layer of dump.layers ?? []) {
    if (layer.error) continue;
    const place = { pack, comp: dump.comp?.name ?? null, layer: layer.name, layerType: layer.type, adjustment: layer.switches?.adjustmentLayer === true, enabled: layer.switches?.enabled !== false };
    const frame = { w: dump.comp?.width ?? null, h: dump.comp?.height ?? null };
    for (const fx of layer.effects ?? []) {
      if (fx.error) continue;
      const e = { ...place, matchName: fx.matchName, name: fx.name, fxEnabled: fx.enabled !== false, params: effectParams(fx) };
      if (BLUR.test(fx.matchName) || BLUR.test(fx.name)) Object.assign(e, { frame, masks: masksOf(layer) });
      effects.push(e);
    }
    if (layer.type === 'text') {
      const st = layerProp(layer, 'ADBE Text Properties', 'ADBE Text Document');
      const doc = st?.value ?? st?.keys?.find((k) => k && k.value)?.value ?? null;
      if (doc) texts.push({ ...place, doc, keyed: Array.isArray(st.keys) && st.keys.length > 0 });
    }
  }
  return { effects, texts };
}

// One style per distinct look; a 1/255 step is the same colour.
export function styleKey(d) {
  const c = (v) => (Array.isArray(v) ? v.slice(0, 3).map((x) => Math.round(x * 255)).join(',') : '-');
  return [d.fontObject?.postScriptName ?? d.font ?? '?', r(d.fontSize, 1), r(d.tracking, 0), d.autoLeading ? 'auto' : r(d.leading, 1), d.applyFill ? c(d.fillColor) : 'nofill', d.applyStroke ? `${c(d.strokeColor)}@${r(d.strokeWidth, 1)}` : 'nostroke', d.allCaps ? 'caps' : '', d.justification ?? '', d.boxText ? 'box' : 'point'].join('|');
}

export function extractLooks(dumpRoot) {
  const effects = new Map();
  const blurs = [];
  const styles = new Map();
  const fonts = {};
  const packs = [];
  for (const d of loadDumpRoot(dumpRoot)) {
    const pack = path.basename(d.dir);
    packs.push(pack);
    fonts[pack] = (d.project?.fonts ?? []).map((f) => (typeof f === 'string' ? f : f.postScriptName ?? f.name ?? JSON.stringify(f)));
    for (const c of d.comps) {
      const { effects: fx, texts } = looksOfComp(c, pack);
      for (const e of fx) {
        const s = effects.get(e.matchName) ?? { matchName: e.matchName, names: new Set(), count: 0, packs: {}, examples: [] };
        s.count += 1;
        s.names.add(e.name);
        s.packs[pack] = (s.packs[pack] ?? 0) + 1;
        if (s.examples.length < 3) s.examples.push({ comp: e.comp, layer: e.layer, adjustment: e.adjustment, params: e.params });
        effects.set(e.matchName, s);
        if (BLUR.test(e.matchName) || BLUR.test(e.name)) blurs.push(e);
      }
      for (const t of texts) {
        const key = styleKey(t.doc);
        const s = styles.get(key) ?? { key, font: t.doc.fontObject?.postScriptName ?? t.doc.font ?? null, size: r(t.doc.fontSize, 1), tracking: r(t.doc.tracking, 0), leading: t.doc.autoLeading ? 'auto' : r(t.doc.leading, 1), fill: t.doc.applyFill ? r(t.doc.fillColor) : null, stroke: t.doc.applyStroke ? { color: r(t.doc.strokeColor), width: r(t.doc.strokeWidth) } : null, allCaps: Boolean(t.doc.allCaps), justification: t.doc.justification ?? null, box: t.doc.boxText ? r(t.doc.boxTextSize) : null, count: 0, packs: {}, examples: [] };
        s.count += 1;
        s.packs[pack] = (s.packs[pack] ?? 0) + 1;
        if (s.examples.length < 4) s.examples.push(`${pack} / ${t.comp} / ${t.layer}: ${String(t.doc.text ?? '').replace(/\s+/g, ' ').slice(0, 40)}`);
        styles.set(key, s);
      }
    }
  }
  return {
    packs,
    effects: [...effects.values()].map((e) => ({ ...e, names: [...e.names] })).sort((a, b) => b.count - a.count),
    blurs,
    styles: [...styles.values()].sort((a, b) => b.count - a.count),
    fonts,
  };
}

export function looksMarkdown(res) {
  const lines = ['# Эффекты, размытия и текстовые стили пакетов (по JSX-дампам)', '', `Пакеты: ${res.packs.join(', ')}.`, '', '## Эффекты', '', '| matchName | Имена | Раз | Пакеты |', '|---|---|---|---|'];
  for (const e of res.effects) lines.push(`| ${e.matchName} | ${e.names.join(', ')} | ${e.count} | ${Object.entries(e.packs).map(([p, n]) => `${p} ${n}`).join(', ')} |`);
  lines.push('', `## Размытия — ${res.blurs.length}`, '', '| Пакет / композиция / слой | Эффект | Корр. слой | Параметры | Маски |', '|---|---|---|---|---|');
  const maskText = (m) => `${m.inverted ? 'инв. ' : ''}${m.mode ?? ''} ${m.box ? `(${m.box.left},${m.box.top})–(${m.box.right},${m.box.bottom})` : '?'}${[m.feather].flat().some((x) => x) ? ` растушёвка ${JSON.stringify(m.feather)}` : ''}${m.keyed ? ' с ключами' : ''}`;
  for (const b of res.blurs.slice(0, 80)) lines.push(`| ${b.pack} / ${b.comp} / ${b.layer} | ${b.name} | ${b.adjustment ? 'да' : 'нет'} | ${Object.entries(b.params).slice(0, 5).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('; ')} | ${(b.masks ?? []).map(maskText).join('; ') || '—'}${b.frame?.w ? ` в кадре ${b.frame.w}×${b.frame.h}` : ''} |`);
  lines.push('', `## Текстовые стили — ${res.styles.length}`, '', '| Шрифт | Кегль | Трекинг | Интерлиньяж | Заливка | Обводка | Caps | Раз | Где |', '|---|---|---|---|---|---|---|---|---|');
  for (const s of res.styles.slice(0, 120)) lines.push(`| ${s.font} | ${s.size} | ${s.tracking} | ${s.leading} | ${s.fill ? s.fill.map((x) => Math.round(x * 255)).join(',') : '—'} | ${s.stroke ? `${s.stroke.color.map((x) => Math.round(x * 255)).join(',')} @${s.stroke.width}` : '—'} | ${s.allCaps ? 'да' : ''} | ${s.count} | ${s.examples.join('; ')} |`);
  lines.push('', '## Шрифты по пакетам', '');
  for (const [p, f] of Object.entries(res.fonts)) lines.push(`- ${p}: ${f.join(', ') || '—'}`);
  return lines.join('\n') + '\n';
}

export function writeLooks(res, outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'effects.json'), JSON.stringify(res.effects, null, 1) + '\n', 'utf8');
  writeFileSync(path.join(outDir, 'blurs.json'), JSON.stringify(res.blurs, null, 1) + '\n', 'utf8');
  writeFileSync(path.join(outDir, 'text-styles.json'), JSON.stringify(res.styles, null, 1) + '\n', 'utf8');
  writeFileSync(path.join(outDir, 'fonts.json'), JSON.stringify(res.fonts, null, 1) + '\n', 'utf8');
  writeFileSync(path.join(outDir, 'summary.md'), looksMarkdown(res), 'utf8');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const res = extractLooks(opt('--dumps', workPath('dumps')));
  const out = opt('--out', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/research/looks'));
  writeLooks(res, out);
  console.log(`OK ${res.packs.length} packs: ${res.effects.length} effects, ${res.blurs.length} blurs, ${res.styles.length} text styles -> ${out}`);
}
