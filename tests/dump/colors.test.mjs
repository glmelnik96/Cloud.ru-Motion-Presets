import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deltaE2000Hex } from '../../tools/color/deltae.mjs';
import { aeColorToHex, classify, layerColors, loadPalette, normalizeHex } from '../../tools/dump/colors.mjs';

describe('colors', () => {
  it('converts AE floats and SVG names to hex', () => {
    expect(aeColorToHex([1, 0.5, 0, 1])).toBe('#FF8000');
    expect(aeColorToHex([0.149, 0.816, 0.486])).toBe('#26D07C');
    expect(normalizeHex('white')).toBe('#FFFFFF');
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('nope')).toBeNull();
  });

  it('measures ΔE2000 with tools/color/deltae.mjs after normalizing names and short hex', () => {
    const pal = loadPalette(null);
    expect(classify('white', pal)).toEqual({ hex: '#FFFFFF', status: 'palette', nearest: '#FFFFFF', dE: 0 });
    const k = classify('#2d8', pal);
    expect(k).toMatchObject({ hex: '#22DD88', status: 'off', nearest: '#26D07C' });
    expect(k.dE).toBe(Math.round(deltaE2000Hex('#22DD88', '#26D07C') * 100) / 100);
    expect(() => classify('nope', pal)).toThrow(/bad hex/);
  });

  it('falls back to the D1 palette and reads any #RRGGBB in tokens.json', () => {
    expect(loadPalette(null)).toMatchObject({ fallback: true, colors: ['#26D07C', '#222222', '#FFFFFF', '#F2F2F2', '#CFF500', '#A068FF', '#C0E0FC'] });
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-tok-'));
    const f = path.join(dir, 'tokens.json');
    writeFileSync(f, JSON.stringify({ color: { green: { value: '#26d07c' }, list: ['#222222', 'not a colour'] }, font: 'SB Sans' }));
    expect(loadPalette(f)).toEqual({ source: f, colors: ['#222222', '#26D07C'], fallback: false });
  });

  it('classifies colours against the palette', () => {
    const pal = loadPalette(null);
    expect(classify('#26D07C', pal)).toEqual({ hex: '#26D07C', status: 'palette', nearest: '#26D07C', dE: 0 });
    expect(classify('#31D383', pal)).toMatchObject({ status: 'near', nearest: '#26D07C', dE: 1.15 });
    expect(classify('#8EE7BB', pal)).toMatchObject({ status: 'off', nearest: '#26D07C' });
  });

  it('lists the colours a layer paints with', () => {
    const layer = {
      type: 'shape', switches: { enabled: true },
      props: [{ matchName: 'ADBE Root Vectors Group', name: 'Contents', children: [
        { matchName: 'ADBE Vector Group', name: 'g', enabled: true, children: [
          { matchName: 'ADBE Vector Graphic - Fill', name: 'Fill 1', enabled: true, children: [
            { matchName: 'ADBE Vector Fill Color', name: 'Color', pvt: 'COLOR', value: [0.192157, 0.827451, 0.513725, 1] }] },
          { matchName: 'ADBE Vector Graphic - Stroke', name: 'Stroke 1', enabled: false, children: [
            { matchName: 'ADBE Vector Stroke Color', name: 'Color', pvt: 'COLOR', keys: [{ time: 0, value: [1, 1, 1, 1] }, { time: 1, value: [0, 0, 0, 1] }] }] },
          { matchName: 'ADBE Vector Graphic - G-Fill', name: 'Gradient Fill 1', children: [] }] }] }],
      effects: [{ name: 'Fill', matchName: 'ADBE Fill', params: [
        { matchName: 'ADBE Fill-0002', name: 'Color', pvt: 'COLOR', modified: true, value: [0.968627, 0.968627, 0.968627, 1] }] },
      { name: 'Drop Shadow', matchName: 'ADBE Drop Shadow', params: [
        { matchName: 'ADBE Drop Shadow-0001', name: 'Shadow Color', pvt: 'COLOR', modified: false, value: [0, 0, 0, 1] }] }],
      masks: [],
    };
    const { colors, skippedDefaults } = layerColors(layer);
    expect(colors.map((c) => [c.hex, c.kind, c.animated, c.off])).toEqual([
      ['#31D383', 'fill', false, false],
      ['#FFFFFF', 'stroke', true, true],
      ['#000000', 'stroke', true, true],
      [null, 'gradient', false, false],
      ['#F7F7F7', 'effect', false, false],
    ]);
    expect(colors[4].label).toBe('ADBE Fill › Color');
    expect(skippedDefaults).toBe(1);
  });

  it('treats a track matte, a guide and a switched-off layer as not painting', () => {
    const shape = (extra) => ({ type: 'shape', effects: [], masks: [], switches: { enabled: true }, ...extra,
      props: [{ matchName: 'ADBE Vector Fill Color', name: 'Color', pvt: 'COLOR', value: [0.811765, 0.960784, 0, 1] }] });
    expect(layerColors(shape({ trackMatte: { type: 'NO_TRACK_MATTE', isTrackMatte: true } })).colors[0]).toMatchObject({ hex: '#CFF500', off: true });
    expect(layerColors(shape({ switches: { enabled: true, guideLayer: true } })).colors[0].off).toBe(true);
    expect(layerColors(shape({ switches: { enabled: false } })).colors[0].off).toBe(true);
    expect(layerColors(shape({})).colors[0].off).toBe(false);
  });

  it('reads text fill and solid sources', () => {
    const text = { type: 'text', props: [{ matchName: 'ADBE Text Properties', name: 'Text', children: [
      { matchName: 'ADBE Text Document', name: 'Source Text', pvt: 'TEXT_DOCUMENT', value: { applyFill: true, fillColor: [0.133333, 0.133333, 0.133333], applyStroke: false } }] }],
    effects: [], masks: [] };
    expect(layerColors(text).colors.map((c) => [c.hex, c.kind])).toEqual([['#222222', 'text-fill']]);
    const solid = { type: 'av', props: [], effects: [], masks: [], source: { kind: 'solid', name: 'Dark Gray Solid 1', color: [0.133333, 0.133333, 0.133333] } };
    expect(layerColors(solid).colors.map((c) => [c.hex, c.kind, c.label])).toEqual([['#222222', 'solid', 'Dark Gray Solid 1']]);
  });
});
