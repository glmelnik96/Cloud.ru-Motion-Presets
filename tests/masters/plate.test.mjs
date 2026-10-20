// TTL_Plate «Текст на плашке»: its numbers from the pack dumps, and its expressions run in Node on a stand-in
// comp (tests/helpers/master-expr.mjs): lines stack from the bottom, an empty line collapses, the sides,
// the timing of both styles and the fit to the frame. Resolves from the dumps: the build machine only.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exprComp } from '../helpers/master-expr.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/podcast/tekst_na_plashke_1.json') && existsSync('C:/CRBK/work/dumps/smm/plashki_9x16.json');
const metrics = JSON.parse(readFileSync(path.join(REPO, 'masters/TTL_Plate/source-metrics.json'), 'utf8'));
const PACK = { TXT_1: 'текст появляется тут', TXT_2: 'Затем появляется тут', TXT_3: 'И тут, и так далее' };
const SMM = { TXT_1: 'Разверните свой сервис', TXT_2: 'видеоконференций', TXT_3: '' };

// Ink in FHD units at the master's font sizes: the pack's 4K podcast texts / 2, the SMM texts at 75 %; any
// other text gets 22 px per character and no descender. Podcast texts are placed by their ink, so their side
// bearing is 1; b is how far the pack's ink reaches below its baseline.
function packInk() {
  const byText = new Map();
  for (const c of metrics.cases) {
    for (const row of Object.values(c.layers)) {
      const s = c.pack === 'podcast' ? 0.5 : (c.comp === 'Плашки_9x16' ? 0.75 : 1 / (1440 / 1080) * 1);
      const base = row.lines.find(Boolean)[1];
      byText.set(row.text.replace(/^\r/, ''), { l: c.pack === 'podcast' ? 1 : row.rect[0] * s, w: row.rect[2] * s, b: (row.rect[1] + row.rect[3] - base) * s });
    }
  }
  return (layer, text) => (text ? byText.get(text) || { l: 1, w: text.length * 22, b: 0 } : { l: 0, w: 0, b: 0 });
}

const plateOf = (c, n, t) => {
  const [w, h] = c.at(n, ['group', 'Plate', 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at(n, ['group', 'Plate', 'Rect', 'ADBE Vector Rect Position'], t);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h };
};

describe.skipIf(!HAS_DUMPS)('TTL_Plate', async () => {
  const { resolve } = await import('../../masters/TTL_Plate/resolve.mjs');
  const p = resolve();
  const comp = (opts) => exprComp(p.spec, { ink: packInk(), ...opts });

  it('takes its numbers from the packs and its curves from the canon', () => {
    const { podcast: pod, smm } = p.layout;
    expect([pod.font, pod.size, pod.tracking, pod.rise]).toEqual(['SBSansDisplay-Bold', 50, -28, 95]);
    expect([smm.font, smm.size, smm.tracking, smm.rise]).toEqual(['SBSansDisplay-Semibold', 75, -50, 75]);
    expect(pod.h).toBeCloseTo(46.01, 2);
    expect(pod.step).toBeCloseTo(45.69, 2);
    expect(pod.edge).toBeCloseTo(52.46, 2);
    expect([pod.bottom.side, pod.bottom.center]).toEqual([expect.closeTo(220.04, 2), expect.closeTo(106.04, 2)]);
    expect([smm.h, smm.step]).toEqual([82.5, 81.75]);
    expect(smm.base).toBeCloseTo(18.26, 2);
    expect(smm.origin).toBeCloseTo(91.27, 1);
    expect([smm.edge.vertical, smm.bottom.vertical, smm.bottom.horizontal]).toEqual([expect.closeTo(29.11, 2), expect.closeTo(350.05, 2), expect.closeTo(90.49, 2)]);
    const t = p.timing;
    expect(t.podcast).toMatchObject({ inDelays: [0, 0.28, 0.68], textLag: 0.52, outStagger: 0.2, plateLag: 0.28 });
    expect(t.smm).toMatchObject({ inDelays: [0, 0.4, 0.8], textLag: 0, outStagger: 0.4, plateLag: 0.56 });
    expect([t.introEnd, t.outroStart]).toEqual([2.12, 5.8]);
    expect(p.duration).toEqual({ introSec: 2.84, holdSec: 2.2, outroSec: 2.96 });
    expect(p.spec.egpNames).toEqual(['Строка 1', 'Строка 2', 'Строка 3', 'Стиль', 'Позиция', 'Скорость', 'Размер текста']);
    expect(p.spec.mattes.map((m) => `${m.layer}<${m.matte}`)).toEqual(['TXT_1<PL_POD_1', 'TXT_2<PL_POD_2', 'TXT_3<PL_POD_3', 'SMM_1<PL_SMM_1', 'SMM_2<PL_SMM_2', 'SMM_3<PL_SMM_3']);
  });

  it('a plate reaches under the descenders of its line (Д, comma): no glyph is cut, the others keep the pack height', () => {
    const c = comp({ ctrl: { Style: 1, Position: 1 }, texts: PACK });
    const h = p.layout.podcast.h;
    // «И тут, и так далее»: the comma and Д reach 8.26 px under the baseline
    const low = plateOf(c, 'PL_POD_3', 4);
    expect(low.y0).toBeCloseTo(1080 - p.layout.podcast.bottom.side - h, 6);
    expect(low.y1 - (1080 - p.layout.podcast.bottom.side)).toBeCloseTo(8.26 - p.layout.podcast.base, 1);
    // round letters overshoot 0.6 px: under 3 % of the font, the plate keeps its height
    expect(plateOf(c, 'PL_POD_1', 4).h).toBeCloseTo(h, 6);
    // SMM: lowercase descenders stay inside the plate (baseline 18.26 px above its bottom)
    const s = comp({ w: 1080, h: 1920, ctrl: { Style: 2, Position: 1 }, texts: SMM });
    expect(plateOf(s, 'PL_SMM_1', 3).h).toBeCloseTo(p.layout.smm.h, 6);
  });

  it('podcast «Авто»: the pack lines on the right, plates within 3 px (4K) of the pack', () => {
    const c = comp({ w: 3840, h: 2160, ctrl: { Style: 1, Position: 1 }, texts: PACK });
    const pack = [[2443.8, 3735.0, 1445.2, 1537.2], [2418.0, 3735.1, 1536.9, 1628.9], [2689.2, 3735.1, 1627.9, 1719.9]];
    pack.forEach(([x0, x1, y0, y1], i) => {
      const pl = plateOf(c, `PL_POD_${i + 1}`, 3);
      // line 3 reaches 16.6 px (4K) lower than the pack's plate, under its comma and Д (the next test)
      for (const [a, b] of [[pl.x0, x0], [pl.x1, x1], [pl.y0, y0]].concat(i < 2 ? [[pl.y1, y1]] : [])) expect(Math.abs(a - b)).toBeLessThan(3);
    });
    expect(c.at('TXT_1', ['transform', 'ADBE Opacity'], 3)).toBe(100);
    expect(c.at('SMM_1', ['transform', 'ADBE Opacity'], 3)).toBe(0);
  });

  it('an empty line collapses: the others stack from the bottom', () => {
    const c = comp({ ctrl: { Style: 1, Position: 2 }, texts: { TXT_1: 'Первая', TXT_2: '', TXT_3: 'Третья' } });
    const a = plateOf(c, 'PL_POD_1', 3);
    const b = plateOf(c, 'PL_POD_3', 3);
    expect(plateOf(c, 'PL_POD_2', 3).w).toBe(0);
    expect(b.y1).toBeCloseTo(1080 - p.layout.podcast.bottom.side, 6);
    expect(b.y1 - a.y1).toBeCloseTo(p.layout.podcast.step, 6);
    // «Слева» mirrors the right side: the plates start at the frame edge's distance
    expect(a.x0).toBeCloseTo(p.layout.podcast.edge, 6);
    expect(b.x0).toBeCloseTo(p.layout.podcast.edge, 6);
  });

  it('SMM «Авто» on 9x16: the pack layout from the left', () => {
    const c = comp({ w: 1080, h: 1920, ctrl: { Style: 2, Position: 1 }, texts: SMM });
    const top = plateOf(c, 'PL_SMM_1', 3);
    const bottom = plateOf(c, 'PL_SMM_2', 3);
    expect(Math.abs(top.x0 - 29.2)).toBeLessThan(0.2);
    expect(Math.abs(bottom.y1 - 1569.95)).toBeLessThan(0.1);
    expect(Math.abs(top.y0 - 1405.7)).toBeLessThan(0.1);
    // pack plates end at 945.84 and 793.35: hand-fitted, their pads after the ink run 17.9–28.1 px (mean here)
    expect(Math.abs(top.x1 - 945.84)).toBeLessThan(3);
    expect(Math.abs(bottom.x1 - 793.35)).toBeLessThan(5.5);
    const [ox] = c.at('SMM_1', ['transform', 'ADBE Position'], 3);
    expect(ox - top.x0).toBeCloseTo(p.layout.smm.origin, 6);
    expect(c.at('SMM_1', ['text'], 3)).toBe(SMM.TXT_1);
  });

  it('sides: SMM on the right keeps the vertical edge, the centre is centred', () => {
    const r = comp({ w: 1080, h: 1920, ctrl: { Style: 2, Position: 4 }, texts: SMM });
    expect(plateOf(r, 'PL_SMM_1', 3).x1).toBeCloseTo(1080 - p.layout.smm.edge.vertical, 6);
    const m = comp({ ctrl: { Style: 1, Position: 3 }, texts: { TXT_1: 'Через несколько лет знание синтаксиса', TXT_2: 'Перестанет быть нужным', TXT_3: '' } });
    const pl = plateOf(m, 'PL_POD_1', 3);
    expect((pl.x0 + pl.x1) / 2).toBeCloseTo(960, 6);
    expect(plateOf(m, 'PL_POD_2', 3).y1).toBeCloseTo(1080 - p.layout.podcast.bottom.center, 6);
  });

  it('timing: the podcast from the top, SMM from the bottom, every exit gone on the last frame', () => {
    const c = comp({ ctrl: { Style: 1, Position: 1 }, texts: PACK });
    const w = (n, t) => plateOf(c, n, t).w;
    expect(w('PL_POD_1', 0.2)).toBeGreaterThan(0);
    expect(w('PL_POD_2', 0.2)).toBe(0);
    expect(w('PL_POD_3', 0.6)).toBe(0);
    const full = [1, 2, 3].map((i) => w(`PL_POD_${i}`, 4));
    expect([1, 2, 3].map((i) => w(`PL_POD_${i}`, 2.12))).toEqual(full);
    // out: line 1 first (6.56), line 3 last, every plate gone on the last frame
    expect(w('PL_POD_1', 6.56 + 0.28 + 0.4)).toBeLessThan(full[0]);
    expect(w('PL_POD_3', 6.96 + 0.28)).toBeCloseTo(full[2], 6);
    expect([1, 2, 3].map((i) => w(`PL_POD_${i}`, 7.96))).toEqual([0, 0, 0]);
    const start = (n, t) => c.at(n, ['selector', 'Rise', 'ADBE Text Percent Start'], t);
    expect([start('TXT_1', 0.4), start('TXT_1', 1.44), start('TXT_3', 2.12), start('TXT_1', 7.96)]).toEqual([0, 100, 100, 0]);
    const s = comp({ w: 1080, h: 1920, ctrl: { Style: 2, Position: 1 }, texts: SMM });
    expect(plateOf(s, 'PL_SMM_2', 0.2).w).toBeGreaterThan(0);
    expect(plateOf(s, 'PL_SMM_1', 0.2).w).toBe(0);
    const end = (n, t) => s.at(n, ['selector', 'Rise', 'ADBE Text Percent End'], t);
    // two lines: the bottom one leaves 0.4 s before the top one, whose plate is gone on the last frame
    expect(end('SMM_2', 6.2 + 0.44)).toBe(0);
    expect(end('SMM_1', 6.6)).toBe(100);
    expect(end('SMM_1', 6.64)).toBeLessThan(100);
    expect(plateOf(s, 'PL_SMM_1', 7.96).w).toBe(0);
    expect(plateOf(s, 'PL_SMM_1', 7.0).w).toBeGreaterThan(0);
  });

  it('speed and size: 2× ends the intro at 1.06 s; a long line at 160 % fits the frame', () => {
    const c = comp({ ctrl: { Style: 1, Position: 1, Speed: 5 }, texts: PACK });
    const rest = plateOf(comp({ ctrl: { Style: 1, Position: 1 }, texts: PACK }), 'PL_POD_3', 4).w;
    expect(plateOf(c, 'PL_POD_3', 1.06).w).toBeCloseTo(rest, 6);
    const long = { TXT_1: 'Ёмкое облако', TXT_2: 'для команд разработки и машинного обучения', TXT_3: 'Cloud.ru Evolution' };
    const big = comp({ w: 1080, h: 1920, ctrl: { Style: 2, Position: 4, Size: 5 }, texts: long });
    const f = big.at('RIG', ['effect', 'FitSmm', 'ADBE Slider Control', 1], 3);
    expect(f).toBeLessThan(1.6);
    const pl = plateOf(big, 'PL_SMM_2', 4);
    expect(pl.x1).toBeCloseTo(1080 - p.layout.smm.edge.vertical, 6);
    expect(pl.x0).toBeGreaterThanOrEqual(p.layout.smm.edge.vertical);
    expect(big.at('SMM_2', ['transform', 'ADBE Scale'], 4)).toEqual([100 * f, 100 * f]);
    const small = comp({ ctrl: { Style: 1, Position: 1, Size: 3 }, texts: PACK });
    expect(small.at('RIG', ['effect', 'FitPod', 'ADBE Slider Control', 1], 3)).toBe(1.2);
  });
});
