// WEB_Announce «Анонс вебинара»: its numbers from the webinars pack and its expressions run in Node on a stand-in comp
// (tests/helpers/master-expr.mjs) in the square and the vertical frame: the layout each frame picks, the date line
// centred or from the left with the pack's gaps, the title, the notches drifting on M10, the dots, the library entry.
// Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bbox, samplePolyline } from '../../tools/dump/geometry.mjs';
import { exprComp } from '../helpers/master-expr.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/webinars/anons_vebinar_9x16.json');
const TITLE = ['TXT_TITLE1', 'TXT_TITLE2', 'TXT_TITLE3'];
const POS = ['transform', 'ADBE Position'];
const SCALE = ['transform', 'ADBE Scale'];
const OPACITY = ['transform', 'ADBE Opacity'];
const SQUARE = { w: 1080, h: 1080 };
const VERTICAL = { w: 1080, h: 1920 };
// 20 px a character at the layer's font, the ink 2 px right of the origin
const ink = (layer, s) => (s ? { l: 2, w: s.length * 20 } : { l: 0, w: 0 });

describe.skipIf(!HAS_DUMPS)('WEB_Announce', async () => {
  const { resolve, libraryEntry } = await import('../../masters/WEB_Announce/resolve.mjs');
  const p = resolve();
  const { square: A, vertical: V, arrow } = p.layout;
  const comp = (frame, opts = {}) => exprComp(p.spec, { ...frame, ink, ...opts });

  it('takes both posts apart: the square scaled from 1400 to 1080, the vertical as it is', () => {
    expect(A.S).toBeCloseTo(1080 / 1400, 6);
    expect(Object.values(A.card).slice(0, 4).map((v) => Math.round(v))).toEqual([40, 416, 1040, 1026]);
    expect(A.card.fill).toBe('#ECECEC');
    expect([A.notches.low.x, A.notches.high.x].map((x) => x.map((v) => Math.round(v)))).toEqual([[290, 356], [716, 633]]);
    expect([A.title.size, A.title.first, A.title.step].map((v) => Math.round(v * 100) / 100)).toEqual([64.26, 214.82, 73.29]);
    expect([A.line.size, A.line.base].map((v) => Math.round(v * 100) / 100)).toEqual([46.29, 112.63]);
    expect([A.line.word, A.line.date, A.line.arrow]).toEqual(['#C2C2C2', '#26D07C', '#C2C2C2']);
    expect(V.card).toMatchObject({ fill: '#6CDFA6' });
    expect(Object.values(V.window).map((v) => Math.round(v))).toEqual([179, 749, 984, 1806]);
    expect([V.title.left, V.title.first, V.title.step, V.title.size, V.title.tracking].map((v) => Math.round(v * 100) / 100)).toEqual([140.42, 410.08, 79, 70, 16]);
    expect([V.line.size, V.line.left, V.line.base].map((v) => Math.round(v * 100) / 100)).toEqual([49.38, 167.67, 276.64]);
    expect([V.line.word, V.line.date, V.line.arrow]).toEqual(['#222222', '#222222', '#FFFFFF']);
    expect([V.dots.white.length, V.dots.dark.length]).toEqual([57, 30]);
    expect([arrow.w, arrow.width]).toEqual([34.56, 4.32]);
    expect(p.duration).toEqual({ introSec: 0, holdSec: 10, outroSec: 0, maxSec: 60 });
    expect(p.packs.square).toEqual({ TXT_TITLE1: 'Чек-лист от юриста:', TXT_TITLE2: 'как выбрать безопасное облако', TXT_TITLE3: '', TXT_DATE: '25 ноября в 11:00' });
    expect(p.packs.vertical.TXT_DATE).toBe('25.11 в 11:00');
  });

  it('the frame picks the layout: the logo and the card\'s colour on the square, the dots and the mint on the vertical', () => {
    const sq = comp(SQUARE);
    const v = comp(VERTICAL);
    expect([sq.at('LOGO', OPACITY, 1), sq.at('DOTS', OPACITY, 1)]).toEqual([100, 0]);
    expect([v.at('LOGO', OPACITY, 1), v.at('DOTS', OPACITY, 1)]).toEqual([0, 100]);
    expect(sq.at('CARD', ['group', 'Card', 'Fill', 'ADBE Vector Fill Color'], 1)).toEqual([0.92549, 0.92549, 0.92549, 1]);
    expect(v.at('CARD', ['group', 'Card', 'Fill', 'ADBE Vector Fill Color'], 1)[0]).toBeCloseTo(0x6c / 255, 5);
    // the visual where each post has it, cut by its card or its window
    expect(sq.at('SLOT_VISUAL', POS, 1)).toEqual([A.visual.cx, A.visual.cy]);
    expect(v.at('SLOT_VISUAL', SCALE, 1)[0]).toBeCloseTo(68, 6);
    const win = v.at('VMATTE', ['group', 'Matte', 'Path 1', 'ADBE Vector Shape'], 1).vertices;
    expect(win).toEqual([[V.window.x0, V.window.y0], [V.window.x1, V.window.y0], [V.window.x1, V.window.y1], [V.window.x0, V.window.y1]]);
    // the title white and untracked on the square, dark and tracked on the vertical
    expect(sq.at('TXT_TITLE1', ['animator', 'Ink', 'ADBE Text Fill Color'], 1)).toEqual([1, 1, 1, 1]);
    expect(v.at('TXT_TITLE1', ['animator', 'Ink', 'ADBE Text Tracking Amount'], 1)).toBeCloseTo(1.12, 6);
    expect(sq.at('TXT_TITLE1', ['animator', 'Ink', 'ADBE Text Tracking Amount'], 1)).toBe(0);
  });

  it('the square\'s notches drift on M10: out over 15 s, back over the next 15, at rest at 0 and 30 s', () => {
    const sq = comp(SQUARE);
    const card = (t) => sq.at('CARD', ['group', 'Card', 'Path 1', 'ADBE Vector Shape'], t).vertices;
    const low = (t) => card(t)[5][0];
    const high = (t) => card(t)[1][0];
    expect([low(0), high(0)]).toEqual(A.notches.low.x.slice(0, 1).concat(A.notches.high.x[0]));
    expect(low(15)).toBeCloseTo(A.notches.low.x[1], 6);
    expect(high(15)).toBeCloseTo(A.notches.high.x[1], 6);
    expect(low(30)).toBeCloseTo(A.notches.low.x[0], 6);
    expect(low(5)).toBeGreaterThan(low(1));
    expect(low(5)).toBeLessThan(low(10));
    // the canon's slow start: a tenth of the way at a fifth of the time
    expect((low(3) - low(0)) / (low(15) - low(0))).toBeLessThan(0.15);
    // the visual's matte follows the card
    expect(sq.at('VMATTE', ['group', 'Matte', 'Path 1', 'ADBE Vector Shape'], 7).vertices).toEqual(card(7));
  });

  it('the date line: centred on the square, from the card\'s inside on the vertical, the pack\'s gaps between ink and arrows', () => {
    for (const [frame, D, centred] of [[SQUARE, A, true], [VERTICAL, V, false]]) {
      const c = comp(frame, { texts: { TXT_DATE: '25.11 в 11:00' } });
      const ts = c.at('TXT_WEB', SCALE, 1)[0] / 100;
      const as = c.at('ARROW1', SCALE, 1)[0] / 100;
      const webL = c.at('TXT_WEB', POS, 1)[0] + 2 * ts;
      const webR = webL + 'Вебинар'.length * 20 * ts;
      const a1 = c.at('ARROW1', POS, 1)[0] - (arrow.width / 2) * as;
      const dateL = c.at('TXT_DATE', POS, 1)[0] + 2 * ts;
      const dateR = dateL + '25.11 в 11:00'.length * 20 * ts;
      const a2 = c.at('ARROW2', POS, 1)[0] - (arrow.width / 2) * as;
      expect(a1 - webR).toBeCloseTo(D.line.gap, 6);
      expect(dateL - (a1 + (arrow.w + arrow.width) * as)).toBeCloseTo(D.line.gap, 6);
      expect(a2 - dateR).toBeCloseTo(D.line.gap, 6);
      const right = a2 + (arrow.w + arrow.width) * as;
      if (centred) expect((webL + right) / 2).toBeCloseTo(A.line.centre, 6);
      else expect(webL).toBeCloseTo(V.line.left, 6);
      expect(c.at('TXT_DATE', POS, 1)[1]).toBeCloseTo(D.line.base, 6);
      expect(c.at('ARROW2', OPACITY, 1)).toBe(100);
    }
    // a long date shrinks the line to the room; no date: «Вебинар ↗» alone
    const long = comp(VERTICAL, { texts: { TXT_DATE: 'двадцать пятого ноября две тысячи двадцать шестого года' } });
    expect(long.at('TXT_DATE', SCALE, 1)[0]).toBeLessThan(100 * V.line.size / 60);
    expect(comp(VERTICAL, { texts: { TXT_DATE: '' } }).at('ARROW2', OPACITY, 1)).toBe(0);
  });

  it('the title: centred lines on the square, from the left on the vertical; empty lines collapse, long ones shrink', () => {
    const sq = comp(SQUARE, { texts: p.packs.square });
    TITLE.slice(0, 2).forEach((t, i) => {
      const [x, y] = sq.at(t, POS, 1);
      const sc = sq.at(t, SCALE, 1)[0] / 100;
      const w = p.packs.square[t].length * 20;
      expect(x + (2 + w / 2) * sc).toBeCloseTo(A.title.centre, 6);
      expect(y).toBeCloseTo(A.title.first + A.title.step * i, 6);
    });
    const v = comp(VERTICAL, { texts: { TXT_TITLE1: '', TXT_TITLE2: 'Одна', TXT_TITLE3: 'Две' } });
    expect(v.at('TXT_TITLE2', POS, 1)).toEqual([V.title.left, V.title.first]);
    expect(v.at('TXT_TITLE3', POS, 1)[1]).toBeCloseTo(V.title.first + V.title.step, 6);
    const long = comp(VERTICAL, { texts: { TXT_TITLE1: 'Ш'.repeat(60), TXT_TITLE2: '', TXT_TITLE3: '' } });
    expect((2 + 60 * 20) * long.at('TXT_TITLE1', SCALE, 1)[0] / 100).toBeCloseTo(p.fit.vRoom, 6);
  });

  it('the dots, the logo and the slot', () => {
    const dots = p.spec.layers.find((l) => l.name === 'DOTS');
    expect(dots.groups.map((g) => [g.name, g.fill, g.paths.length])).toEqual([['White', '#FFFFFF', 57], ['Dark', '#222222', 30]]);
    const logo = p.spec.layers.find((l) => l.name === 'LOGO');
    const b = bbox(logo.groups.flatMap((g) => g.paths.flatMap((sp) => samplePolyline(sp))));
    expect([b.x0, b.y1].map((v) => Math.round(v))).toEqual([40, 1026]);
    const s = p.spec.layers.find((l) => l.name === 'SLOT_VISUAL');
    expect(s.placeholder).toMatchObject({ w: 1976, h: 1580 });
    expect(p.spec.mattes).toEqual([{ layer: 'SLOT_VISUAL', matte: 'VMATTE', type: 'ALPHA' }]);
  });

  it('the panel\'s form, Essential Graphics and the library entry agree', () => {
    expect(p.spec.egpNames).toEqual(['Заголовок, строка 1', 'Заголовок, строка 2', 'Заголовок, строка 3', 'Дата', 'Визуал']);
    const lib = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
    expect(lib.items.find((i) => i.id === 'WEB_Announce')).toEqual(libraryEntry(p));
  });
});
