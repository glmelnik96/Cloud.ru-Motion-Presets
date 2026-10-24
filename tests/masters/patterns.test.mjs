// BG_Patterns «Паттерны и иконки»: the stills from the packs' vectors — the rack's cell (the SMM grid's strokes), the
// announce's arrow, its dots, the podcast's globe at rest — the SVGs written from them, the element and the ground
// picked by «Элемент» and «Фон», the files and the library entry; the master's expressions run in Node on a stand-in
// comp (tests/helpers/master-expr.mjs). Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bbox, samplePolyline } from '../../tools/dump/geometry.mjs';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const HAS_DUMPS = ['smm/pattern_edit', 'webinars/pattern_rack', 'webinars/anons_vebinar_1x1', 'podcast/pattern_1'].every((f) => existsSync(`C:/CRBK/work/dumps/${f}.json`));
const box = (sps) => bbox(sps.flatMap((s) => samplePolyline(s)));
const round = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 100) / 100]));

describe.skipIf(!HAS_DUMPS)('BG_Patterns', async () => {
  const { resolve, libraryEntry, pathD } = await import('../../masters/BG_Patterns/resolve.mjs');
  const p = resolve();
  const S = p.stills;
  const I = p.icons;
  const comp = (w, h, Element = 1, Ground = 1) => exprComp(p.spec, { w, h, ink: () => ({ l: 0, w: 0 }), ctrl: { Element, Ground } });

  it('takes the cell from the rack: two strokes of 4 px inside the 150 px pitch, a tile without a seam', () => {
    expect([S.cell.width, S.cell.colour, S.cell.paths.length]).toEqual([4, '#222222', 2]);
    const b = box(S.cell.paths);
    expect(round(b)).toMatchObject({ x0: 15.01, y0: 14.16, x1: 143.23, y1: 142.13 });
    // the strokes stay inside the cell: the next one starts where this one ends
    expect(b.x0 - 2).toBeGreaterThan(0);
    expect(b.y0 - 2).toBeGreaterThan(0);
    expect(b.x1 + 2).toBeLessThan(150);
    expect(b.y1 + 2).toBeLessThan(150);
  });

  it('draws the arrow as the cell\'s strokes with the announce\'s weight, an eighth of its size', () => {
    expect(S.arrow.ratio).toBe(0.125);
    expect([I.arrow.width, I.arrow.w]).toEqual([12.5, 112.5]);
    // the stroke's half on every side: the drawing's box is 100 px wide
    expect(round(box(I.arrow.strokes))).toMatchObject({ x0: 6.25, x1: 106.25 });
  });

  it('takes the dots and the globe at rest from their packs', () => {
    expect(I.dots.fills).toHaveLength(30);
    expect([I.dots.w, I.dots.h]).toEqual([176, 164]);
    expect(box(I.dots.fills).x1).toBeLessThanOrEqual(176);
    expect([I.globe.strokes.length, I.globe.fills.length, I.globe.width]).toEqual([4, 4, 5.916]);
    expect([Math.round(I.globe.w * 10) / 10, Math.round(I.globe.h * 10) / 10]).toEqual([384.6, 195.1]);
    // the ellipses are curves, the equator and the axis straight
    expect(I.globe.strokes.filter((sp) => sp.closed)).toHaveLength(2);
  });

  it('writes the SVGs from the same geometry: the cell as a tile, the icons tight', () => {
    const svg = (key) => p.files.find((f) => f.key === key).content;
    expect(svg('svg_pattern_dark')).toContain('viewBox="0 0 150 150"');
    expect(svg('svg_pattern_dark')).toContain('stroke="#FFFFFF" stroke-width="4" stroke-opacity="0.25"');
    expect(svg('svg_pattern_light')).toContain('stroke="#222222" stroke-width="4">');
    expect(svg('svg_globe_light')).toContain('viewBox="0 0 384.567 195.12"');
    expect(svg('svg_dots_dark').match(/<path /g)).toHaveLength(30);
    expect(svg('svg_arrow_light')).toContain(`<path d="${pathD(I.arrow.strokes[1])}"/>`);
    expect(pathD({ closed: true, vertices: [[0, 0], [10, 0]], inTangents: [[0, 0], [0, 0]], outTangents: [[0, 5], [0, 0]] })).toBe('M0 0C0 5 10 0 10 0L0 0Z');
  });

  it('shows the element «Элемент» picks, coloured by «Фон»; the pattern at BG_Rack\'s scale, an icon at a third of the short side', () => {
    const op = (c, layer) => c.at(layer, P.opacity, 0);
    const hd = comp(1920, 1080, 1, 1);
    expect(['PATTERN', 'ARROW', 'DOTS', 'GLOBE'].map((l) => op(hd, l))).toEqual([25, 0, 0, 0]);
    expect(op(comp(1920, 1080, 1, 2), 'PATTERN')).toBe(100);
    expect(['PATTERN', 'ARROW', 'DOTS', 'GLOBE'].map((l) => op(comp(1920, 1080, 4, 2), l))).toEqual([0, 0, 0, 100]);
    expect(hd.at('PATTERN', P.scale, 0)).toEqual([50, 50]);
    expect(comp(3840, 2160).at('PATTERN', P.scale, 0)).toEqual([100, 100]);
    expect(comp(1080, 1920, 2).at('ARROW', P.scale, 0)[0]).toBeCloseTo((100 * 360) / 112.5, 4);
    expect(comp(3840, 2160, 4).at('GLOBE', P.scale, 0)[0]).toBeCloseTo((2 * 100 * 360) / I.globe.w, 4);
    expect(comp(1080, 1080, 3).at('DOTS', P.pos, 0)).toEqual([540, 540]);
    expect(comp(1920, 1080, 3, 2).at('DOTS', P.fill('Squares'), 0)).toEqual([0.133333, 0.133333, 0.133333, 1]);
    expect(comp(1920, 1080, 1, 1).at('PATTERN', ['group', 'Cell', 'Stroke', 'ADBE Vector Stroke Color'], 0)).toEqual([1, 1, 1, 1]);
  });

  it('lists a PNG of each format and an SVG per element and ground; the library entry agrees', () => {
    expect(p.files).toHaveLength(40);
    expect(p.files.slice(0, 5).map((f) => f.key)).toEqual(['16x9_pattern_dark', '16x9_4K_pattern_dark', '9x16_pattern_dark', '1x1_pattern_dark', 'svg_pattern_dark']);
    expect(Math.max(...p.files.map((f) => f.key.length))).toBeLessThanOrEqual(24);
    const lib = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
    expect(lib.items.find((i) => i.id === 'BG_Patterns')).toEqual(libraryEntry(p));
    const ref = JSON.parse(readFileSync(path.join(REPO, 'masters', 'BG_Patterns', 'ref.json'), 'utf8'));
    expect(ref.preview.backdropColor.map((b) => b.color)).toEqual(p.grounds.map((g) => g.plateHex));
  });
});
