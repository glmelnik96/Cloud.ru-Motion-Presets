// Colours in dumps: AE 0..1 floats to hex, the brand palette from brand/tokens.json, palette classes.
// sRGB -> CIELAB and CIEDE2000 come from tools/color/deltae.mjs (Plan 1, Task 12).
import { existsSync } from 'node:fs';
import { deltaE2000Hex, rgbToHex } from '../color/deltae.mjs';
import { nodeValues, readJson, walkLayer } from './model.mjs';

// D1 (spec 9): the canon when brand/tokens.json is missing or has no colours.
export const D1_PALETTE = ['#26D07C', '#222222', '#FFFFFF', '#F2F2F2', '#CFF500', '#A068FF', '#C0E0FC'];
export const NEAR_DE = 2; // spec 4.4: ΔE2000 <= 2 counts as the same colour in QA
const NAMED = { white: '#FFFFFF', black: '#000000' };

// An AE colour ([r, g, b] or [r, g, b, a], channels 0..1; alpha ignored) as "#RRGGBB".
export function aeColorToHex(rgb) {
  return rgbToHex({ r: Number(rgb[0]) * 255, g: Number(rgb[1]) * 255, b: Number(rgb[2]) * 255 });
}

// "#RRGGBB" from "#rrggbb", "#rgb" (with or without #) or an SVG colour name; null for anything else.
export function normalizeHex(s) {
  const t = String(s).trim().toLowerCase();
  if (NAMED[t]) return NAMED[t];
  const m6 = /^#?([0-9a-f]{6})$/.exec(t);
  if (m6) return '#' + m6[1].toUpperCase();
  const m3 = /^#?([0-9a-f]{3})$/.exec(t);
  if (m3) return '#' + m3[1].split('').map((ch) => ch + ch).join('').toUpperCase();
  return null;
}

// Every "#RRGGBB" string anywhere in tokens.json counts as a palette colour: the file is a draft
// (Plan 1), so its shape is not relied on. Missing file or no colours: the D1 palette.
export function loadPalette(file) {
  if (file && existsSync(file)) {
    const found = new Set();
    const walk = (v) => {
      if (typeof v === 'string') {
        if (/^#[0-9a-f]{6}$/i.test(v.trim())) found.add(v.trim().toUpperCase());
      } else if (Array.isArray(v)) {
        v.forEach(walk);
      } else if (v && typeof v === 'object') {
        Object.values(v).forEach(walk);
      }
    };
    walk(readJson(file));
    if (found.size) return { source: file, colors: [...found].sort(), fallback: false };
  }
  return { source: 'палитра D1 из спецификации (§9)', colors: D1_PALETTE.slice(), fallback: true };
}

// Nearest palette colour by ΔE2000. A name or a short hex is normalized first (deltae.mjs reads only
// #RRGGBB); anything else throws "bad hex colour".
export function classify(hex, palette) {
  const h = normalizeHex(hex);
  let nearest = null;
  let dE = Infinity;
  for (const p of palette.colors) {
    const d = deltaE2000Hex(h, p);
    if (d < dE) { dE = d; nearest = p; }
  }
  const status = palette.colors.includes(h) ? 'palette' : dE <= NEAR_DE ? 'near' : 'off';
  return { hex: h, status, nearest, dE: Math.round(dE * 100) / 100 };
}

function kindOf(node, area) {
  if (area === 'effect') return 'effect';
  if (node.matchName === 'ADBE Vector Fill Color') return 'fill';
  if (node.matchName === 'ADBE Vector Stroke Color') return 'stroke';
  return 'color';
}

// Colours one layer paints with. Unmodified effect colours are effect defaults the designer never
// chose (Drop Shadow black and the like): they are counted in `skippedDefaults`, not listed.
export function layerColors(layer) {
  const out = [];
  let skippedDefaults = 0;
  // Switched off, a guide or used as a track matte: the layer's own colours never reach the frame.
  const sw = layer.switches || {};
  const layerOff = sw.enabled === false || sw.guideLayer === true || Boolean(layer.trackMatte && layer.trackMatte.isTrackMatte === true);
  const push = (hex, kind, label, node, off) => {
    if (out.some((e) => e.hex === hex && e.kind === kind && e.label === label)) return;
    out.push({ hex, kind, label, animated: Boolean(node && node.keys && node.keys.length),
      expression: Boolean(node && node.expression), off: Boolean(off || layerOff) });
  };
  for (const { node, trail, off, area, effect } of walkLayer(layer)) {
    if (area === 'mask') continue;
    if (/^ADBE Vector Graphic - G-(Fill|Stroke)$/.test(node.matchName || '')) {
      push(null, 'gradient', trail.join(' › '), node, off);
      continue;
    }
    if (node.pvt === 'COLOR') {
      if (area === 'effect' && node.modified === false) { skippedDefaults += 1; continue; }
      const label = area === 'effect' ? `${effect.matchName} › ${node.name}` : trail.join(' › ');
      for (const { value } of nodeValues(node)) {
        if (Array.isArray(value)) push(aeColorToHex(value), kindOf(node, area), label, node, off);
      }
    } else if (node.pvt === 'TEXT_DOCUMENT') {
      for (const { value } of nodeValues(node)) {
        if (!value) continue;
        if (value.applyFill && Array.isArray(value.fillColor)) push(aeColorToHex(value.fillColor), 'text-fill', trail.join(' › '), node, off);
        if (value.applyStroke && Array.isArray(value.strokeColor)) push(aeColorToHex(value.strokeColor), 'text-stroke', trail.join(' › '), node, off);
      }
    }
  }
  if (layer.type === 'av' && layer.source && layer.source.kind === 'solid' && Array.isArray(layer.source.color)) {
    push(aeColorToHex(layer.source.color), 'solid', layer.source.name, null, false);
  }
  return { colors: out, skippedDefaults };
}
