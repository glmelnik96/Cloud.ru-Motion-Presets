import { describe, it, expect } from 'vitest';
import { analyse, extractShape, findCopies, masterParts, overlaySvg, renderReport, verdict } from '../../tools/dump/logo-diff.mjs';
import { loadPalette } from '../../tools/dump/colors.mjs';

const sq = (x, y, s) => `M${x} ${y}H${x + s}V${y + s}H${x}Z`;
const CUBE_D = [sq(0, 0, 10), sq(12, 0, 10), sq(0, 12, 10)].join('');
const WORD_D = Array.from({ length: 10 }, (_, i) => sq(30 + i * 7, 0, 5)).join('');
const SVG = `<svg viewBox="0 0 100 22" xmlns="http://www.w3.org/2000/svg"><g>
<path d="${CUBE_D}" fill="#26D07C"/>
<path d="${WORD_D}" fill="white"/>
</g></svg>`;

const GREEN = [0.14902, 0.815686, 0.486275, 1];
const NEAR_GREEN = [0.192157, 0.827451, 0.513725, 1];
const WHITE = [1, 1, 1, 1];

function shapeLayer(index, name, subpaths, { fill = GREEN, position = [0, 0], scale = [100, 100], extra = [] } = {}) {
  const paths = subpaths.map((sp, i) => ({ matchName: 'ADBE Vector Shape - Group', name: 'Path ' + (i + 1), enabled: true,
    children: [{ matchName: 'ADBE Vector Shape', name: 'Path', pvt: 'SHAPE', value: { ...sp, count: sp.vertices.length } }] }));
  const fillNode = { matchName: 'ADBE Vector Graphic - Fill', name: 'Fill 1', enabled: true,
    children: [{ matchName: 'ADBE Vector Fill Color', name: 'Color', pvt: 'COLOR', value: fill }] };
  const tr = { matchName: 'ADBE Vector Transform Group', name: 'Transform', children: [
    { matchName: 'ADBE Vector Anchor', name: 'Anchor Point', value: [0, 0] },
    { matchName: 'ADBE Vector Position', name: 'Position', value: position },
    { matchName: 'ADBE Vector Scale', name: 'Scale', value: scale },
    { matchName: 'ADBE Vector Rotation', name: 'Rotation', value: 0 }] };
  return {
    index, name, type: 'shape', switches: { enabled: true }, effects: [], masks: [],
    props: [
      { matchName: 'ADBE Root Vectors Group', name: 'Contents', children: [
        { matchName: 'ADBE Vector Group', name: 'Group 1', enabled: true, children: [
          { matchName: 'ADBE Vectors Group', name: 'Contents', children: [...paths, ...extra, fillNode] }, tr] }] },
      { matchName: 'ADBE Transform Group', name: 'Transform', children: [{ matchName: 'ADBE Scale', name: 'Scale', value: [100, 100, 100] }] },
    ],
  };
}

const bundle = (slug, comps) => ({ index: { slug }, comps: comps.map(([id, name, layers]) => ({ comp: { id, name }, compSlug: 'c' + id, layers })) });

function scene() {
  const master = masterParts(SVG);
  const cube = master.parts.cube;
  const word = master.parts.wordmark;
  const bent = cube.map((sp, i) => (i === 0 ? { ...sp, vertices: sp.vertices.map((v) => (v[0] === 10 && v[1] === 10 ? [11, 11] : v)) } : sp));
  const bundles = [
    bundle('logo', [[5, 'Умное облако', [shapeLayer(1, 'LOGO', cube, { position: [50, 0], scale: [200, 200] }), shapeLayer(2, 'Cloud.ru', word, { fill: WHITE })]]]),
    bundle('smm', [[9, 'Cloud.ru_BlackMono', [shapeLayer(1, 'Layer 4 Outlines', bent, { fill: NEAR_GREEN }), shapeLayer(2, 'Layer 3 Outlines', word, { fill: WHITE })]]]),
    bundle('webinars', [[3, 'Logo', [shapeLayer(1, 'Layer 3 Outlines 3', word, { fill: WHITE }), shapeLayer(2, 'Layer 4 Outlines 3', cube)]]]),
  ];
  const candidates = [
    { slug: 'logo', comp: 'Умное облако', cube: 'LOGO', wordmark: 'Cloud.ru' },
    { slug: 'smm', comp: 'Cloud.ru_BlackMono', cube: 'Layer 4 Outlines', wordmark: 'Layer 3 Outlines X' },
    { slug: 'podcast', comp: 'Cloud.ru_WhiteColour', cube: 'Layer 4 Outlines', wordmark: 'Layer 3 Outlines' },
  ];
  return { master, bundles, candidates };
}

describe('logo-diff', () => {
  it('splits the master SVG into cube and wordmark by fill', () => {
    const m = masterParts(SVG);
    expect([m.parts.cube.length, m.parts.wordmark.length]).toEqual([3, 10]);
    expect(m.fills).toEqual({ cube: ['#26D07C'], wordmark: ['#FFFFFF'] });
  });

  it('extracts layer-space outlines with group transforms, skipping switched-off and primitive shapes', () => {
    const rect = { matchName: 'ADBE Vector Shape - Rect', name: 'Rectangle 1', enabled: true, children: [] };
    const merge = { matchName: 'ADBE Vector Filter - Merge', name: 'Merge Paths 1', enabled: true, children: [] };
    const off = { matchName: 'ADBE Vector Shape - Group', name: 'Hidden', enabled: false, children: [] };
    const layer = shapeLayer(1, 'L', masterParts(SVG).parts.cube.slice(0, 1), { position: [100, 0], scale: [200, 200], extra: [rect, merge, off] });
    const s = extractShape(layer);
    expect(s.pathCount).toBe(1);
    expect(s.subpaths[0].vertices).toEqual([[100, 0], [120, 0], [120, 20], [100, 20]]);
    expect(s.ignored).toEqual(['Group 1 › Rectangle 1']);
    expect([s.merges, s.offSkipped]).toEqual([1, 1]);
    expect(s.layerScale).toEqual([100, 100]);
  });

  it('finds the audit copies, reports what is missing and discovers look-alikes', () => {
    const { bundles, candidates } = scene();
    const { copies, missing } = findCopies(bundles, candidates);
    expect(copies.map((c) => `${c.slug}/${c.layer}/${c.part}/${c.source}`)).toEqual([
      'logo/LOGO/cube/аудит', 'logo/Cloud.ru/wordmark/аудит', 'smm/Layer 4 Outlines/cube/аудит',
      'smm/Layer 3 Outlines/wordmark/эвристика', 'webinars/Layer 4 Outlines 3/cube/эвристика', 'webinars/Layer 3 Outlines 3/wordmark/эвристика',
    ]);
    expect(missing.map((m) => `${m.slug}/${m.reason}`)).toEqual(['smm/нет слоя', 'podcast/нет дампа пакета']);
  });

  it('groups equal geometry and compares it with the master and pairwise', () => {
    const { master, bundles, candidates } = scene();
    const a = analyse(findCopies(bundles, candidates).copies, master);
    expect(a.cube.groups.map((g) => [g.label, g.members.length, g.verdict])).toEqual([['C1', 2, 'совпадает'], ['C2', 1, 'отличается']]);
    expect(a.cube.groups[0].toMaster.max).toBeLessThan(1e-9);
    expect(a.cube.groups[1].toMaster.max).toBeCloseTo(Math.SQRT2 / 22, 4);
    expect(a.cube.pairs).toHaveLength(1);
    expect(a.wordmark.groups.map((g) => [g.label, g.members.length, g.verdict])).toEqual([['W1', 3, 'совпадает']]);
  });

  it('renders the report with copies, groups, colours and misses', () => {
    const { master, bundles, candidates } = scene();
    const { copies, missing } = findCopies(bundles, candidates);
    const a = analyse(copies, master);
    const md = renderReport(a, { missing, palette: loadPalette(null), master, meta: { date: '2026-10-05', dumps: 'C:/CRBK/work/dumps', masterFile: 'brand/logo/m.svg', masterSha: 'abc' } });
    expect(md).toContain('# Геометрия копий логотипа (D18)');
    expect(md).toContain('| C2 | 1 | 1.0000 | 64.28 |');
    expect(md).toContain('| C1 | — | 64.28 (');
    expect(md).toContain('#31D383 fill (≈ #26D07C, ΔE 1.15)');
    expect(md).toContain('- podcast / Cloud.ru_WhiteColour (обе детали): нет дампа пакета');
    expect(md).toContain('- куб: копий 3, групп 2; совпадают с мастером 2, близко 0, отличаются 1.');
  });

  it('tells apart two comps with the same name by id', () => {
    const { master } = scene();
    const pair = () => [shapeLayer(1, 'Layer 4 Outlines 3', master.parts.cube), shapeLayer(2, 'Layer 3 Outlines 3', master.parts.wordmark, { fill: WHITE })];
    const bundles = [bundle('courses', [[3, 'Logo', pair()], [4, 'Logo', pair()]])];
    const { copies, missing } = findCopies(bundles, [{ slug: 'courses', comp: 'Logo', cube: 'Layer 4 Outlines 3', wordmark: 'Layer 3 Outlines 3' }]);
    const md = renderReport(analyse(copies, master), { missing, palette: loadPalette(null), master });
    expect(copies).toHaveLength(4);
    expect(md).toContain('| C1 | courses | Logo (id 3) | Layer 4 Outlines 3 | аудит |');
    expect(md).toContain('| C1 | courses | Logo (id 4) | Layer 4 Outlines 3 | аудит |');
  });

  it('draws an overlay of master and copy', () => {
    const { master, bundles, candidates } = scene();
    const a = analyse(findCopies(bundles, candidates).copies, master);
    const svg = overlaySvg(a.cube.master, a.cube.groups[1].norm);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.match(/<path /g)).toHaveLength(2);
  });

  it('turns distances into verdicts', () => {
    expect([verdict(0.0005), verdict(0.003), verdict(0.02)]).toEqual(['совпадает', 'близко', 'отличается']);
  });
});
