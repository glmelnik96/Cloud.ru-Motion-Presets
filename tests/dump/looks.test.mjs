// Looks from the JSX dumps (tools/dump/looks.mjs): effects with their parameters, blurs, text styles, fonts.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { effectParams, extractLooks, styleKey, writeLooks } from '../../tools/dump/looks.mjs';

const doc = (text, o = {}) => ({ text, font: 'SBSansDisplay-Semibold', fontSize: 48, tracking: 0, autoLeading: true, applyFill: true, fillColor: [1, 1, 1], applyStroke: false, allCaps: false, justification: 'LEFT_JUSTIFY', boxText: false, ...o });
const textLayer = (name, d) => ({ index: 1, name, type: 'text', switches: { enabled: true }, effects: [], masks: [], props: [
  { matchName: 'ADBE Text Properties', name: 'Text', children: [{ matchName: 'ADBE Text Document', name: 'Source Text', pvt: 'TEXT_DOCUMENT', value: d }] },
] });
// the podcast: only the fields outside an inverted rectangle are blurred
const fields = { name: 'Mask 1', mode: 'ADD', inverted: true, path: { matchName: 'ADBE Mask Shape', pvt: 'SHAPE', value: { vertices: [[105, 102], [3735, 102], [3735, 2058], [105, 2058]], closed: true } }, feather: { value: [0, 0] }, expansion: { value: 0 }, opacity: { value: 100 }, other: [] };
const blurAdj = { index: 2, name: 'Blur', type: 'adjustment', switches: { enabled: true, adjustmentLayer: true }, masks: [fields], props: [], effects: [
  { index: 1, matchName: 'ADBE Gaussian Blur 2', name: 'Gaussian Blur', enabled: true, params: [
    { matchName: 'ADBE Gaussian Blur 2-0001', name: 'Blurriness', pvt: 'OneD', value: 60 },
    { matchName: 'ADBE Gaussian Blur 2-0002', name: 'Blur Dimensions', pvt: 'OneD', value: 1 },
    { matchName: 'ADBE Gaussian Blur 2-0003', name: 'Repeat Edge Pixels', pvt: 'OneD', keys: [{ time: 0, value: 0 }, { time: 1, value: 1 }] },
  ] },
  { index: 2, matchName: 'ADBE Fill', name: 'Fill', enabled: true, params: [{ matchName: 'ADBE Fill-0002', name: 'Color', pvt: 'COLOR', value: [0.149, 0.816, 0.486, 1], expression: { text: 'comp("CTRL").layer(1).effect(1)(1)', enabled: true } }] },
] };

function root() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-looks-'));
  const write = (slug, layers, fonts) => {
    mkdirSync(path.join(dir, slug), { recursive: true });
    writeFileSync(path.join(dir, slug, 'index.json'), JSON.stringify({ comps: [{ file: 'c.json' }] }));
    writeFileSync(path.join(dir, slug, 'project.json'), JSON.stringify({ fonts }));
    writeFileSync(path.join(dir, slug, 'c.json'), JSON.stringify({ comp: { name: `${slug} main`, frameRate: 25, width: 3840, height: 2160 }, layers }));
  };
  write('podcast', [blurAdj, textLayer('Тег', doc('Подкаст', { allCaps: true }))], [{ postScriptName: 'SBSansDisplay-Semibold', uses: 3 }]);
  write('courses', [textLayer('Субтитр', doc('Первая строка\rвторая', { font: 'SBSansText-Regular', fontSize: 40 })), textLayer('Субтитр 2', doc('Ещё', { font: 'SBSansText-Regular', fontSize: 40 }))], [{ postScriptName: 'SBSansText-Regular' }]);
  return dir;
}

describe('looks', () => {
  it('lists effect parameters: static, keyed, driven by an expression', () => {
    expect(effectParams(blurAdj.effects[0])).toEqual({ Blurriness: 60, 'Blur Dimensions': 1, 'Repeat Edge Pixels': { keyed: 2, first: 0, last: 1 } });
    expect(effectParams(blurAdj.effects[1])['Color (expression)']).toBe('comp("CTRL").layer(1).effect(1)(1)');
  });

  it('collects effects, blurs with their layer, text styles and fonts per pack', () => {
    const res = extractLooks(root());
    expect(res.packs).toEqual(['courses', 'podcast']);
    expect(res.effects.map((e) => [e.matchName, e.count])).toEqual([['ADBE Gaussian Blur 2', 1], ['ADBE Fill', 1]]);
    expect(res.blurs).toEqual([expect.objectContaining({ pack: 'podcast', layer: 'Blur', adjustment: true, params: expect.objectContaining({ Blurriness: 60 }), frame: { w: 3840, h: 2160 } })]);
    expect(res.blurs[0].masks).toEqual([{ name: 'Mask 1', mode: 'ADD', inverted: true, feather: [0, 0], expansion: 0, opacity: 100, keyed: false, vertices: 4, closed: true, box: { left: 105, top: 102, right: 3735, bottom: 2058 } }]);
    expect(res.styles.map((s) => [s.font, s.size, s.count, s.allCaps])).toEqual([['SBSansText-Regular', 40, 2, false], ['SBSansDisplay-Semibold', 48, 1, true]]);
    expect(res.styles[0].examples[0]).toBe('courses / courses main / Субтитр: Первая строка вторая');
    expect(res.fonts).toEqual({ courses: ['SBSansText-Regular'], podcast: ['SBSansDisplay-Semibold'] });
  });

  it('one style per look: a 1/255 step of colour is the same', () => {
    expect(styleKey(doc('a', { fillColor: [1, 1, 1] }))).toBe(styleKey(doc('b', { fillColor: [0.999, 1, 1] })));
    expect(styleKey(doc('a'))).not.toBe(styleKey(doc('a', { tracking: 20 })));
  });

  it('writes the files and a readable page', () => {
    const out = mkdtempSync(path.join(os.tmpdir(), 'bk-looks-out-'));
    writeLooks(extractLooks(root()), out);
    const md = readFileSync(path.join(out, 'summary.md'), 'utf8');
    expect(md).toContain('| podcast / podcast main / Blur | Gaussian Blur | да | Blurriness: 60;');
    expect(md).toContain('| инв. ADD (105,102)–(3735,2058) в кадре 3840×2160 |');
    expect(md).toContain('| SBSansText-Regular | 40 | 0 | auto | 255,255,255 | — |  | 2 |');
    expect(JSON.parse(readFileSync(path.join(out, 'blurs.json'), 'utf8'))).toHaveLength(1);
  });
});
