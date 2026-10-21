// POD_Guest «О госте»: its numbers from the podcast pack and its expressions run in Node on a stand-in comp
// (tests/helpers/master-expr.mjs): the panel and the two texts at rest, the bio under the head however many
// lines they wrap to, the side, an empty bio, the wipe and the words. Resolves from the dumps: the build
// machine only.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exprComp } from '../helpers/master-expr.mjs';

const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/podcast/o_goste.json');
const BOX_H = { HEAD: 300, BIO: 1000 };

// box texts: the ink bottom in layer space (the box is centred on the layer origin) for a text of n lines,
// as AE lays it out: the first baseline 0.75 of the size under the box top, then one leading per line
function boxInk(p, lines) {
  const X = p.layout.text;
  const at = { HEAD: X.head, BIO: X.bio };
  return (layer, s) => {
    if (!s) return { l: 0, w: 0, b: 0 };
    const st = at[layer];
    if (!st) return { l: 0, w: s.length * 20, b: 0 };
    const n = lines[layer];
    return { l: 0, w: 500, b: 0.75 * st.size + (n - 1) * st.leading - BOX_H[layer] / 2 };
  };
}
const rectOf = (c, layer, group, t) => {
  const [w, h] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Size'], t);
  const [x, y] = c.at(layer, ['group', group, 'Rect', 'ADBE Vector Rect Position'], t);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h };
};

describe.skipIf(!HAS_DUMPS)('POD_Guest', async () => {
  const { resolve } = await import('../../masters/POD_Guest/resolve.mjs');
  const p = resolve();
  const comp = (lines, opts = {}) => exprComp(p.spec, { ink: boxInk(p, lines), ...opts });

  it('takes the window, the panel, the two styles and the curves from the pack', () => {
    const { win, panel, text: X } = p.layout;
    expect(win).toEqual({ x0: 52.5, x1: 1867.5, y0: 51, y1: 1029 });
    expect(panel.w).toBeCloseTo(623.29, 2);
    expect(panel.off).toBeCloseTo(628.93, 2);
    expect(panel.fill).toBe('#D3D3D3');
    expect([X.padL, X.boxW, X.headFirst, X.gap, X.padB].map((v) => Math.round(v * 100) / 100)).toEqual([34.31, 571.83, 52.65, 65, 39.77]);
    expect(X.head).toMatchObject({ font: 'SBSansDisplay-Semibold', size: 35, leading: 37.5, tracking: -10, lines: 2 });
    expect(X.bio).toMatchObject({ font: 'SBSansDisplay-Regular', size: 25, leading: 27.5, tracking: -10, lines: 10 });
    expect([X.rise, X.opacity, X.fill]).toEqual([36, 0, '#222222']);
    const t = p.timing;
    expect([t.panelIn.frames, t.panelIn.t0, t.panelOut.frames, t.panelOut.t0]).toEqual([14, 0, 23, 7.08]);
    expect(t.words).toEqual({ t0: 0.48, t1: 0.92 });
    expect(p.duration).toEqual({ introSec: 1.24, holdSec: 5.52, outroSec: 1.24 });
    expect(p.spec.egpNames).toEqual(['Имя', 'Должность', 'Био, абзац 1', 'Био, абзац 2', 'Био, абзац 3', 'Сторона', 'Скорость']);
    // the pack's texts are resolved for the comparison, not kept in the repo
    expect(Object.keys(p.pack)).toEqual(['TXT_NAME', 'TXT_ROLE', 'TXT_BIO1', 'TXT_BIO2', 'TXT_BIO3']);
    expect(p.text.TXT_NAME.value).toBe('Имя Фамилия');
  });

  it('at rest, the pack texts: the head and the bio on the pack baselines, the panel the pack panel', () => {
    const c = comp({ HEAD: 2, BIO: 10 }, { texts: p.pack });
    const X = p.layout.text;
    const [hx, hy] = c.at('HEAD', ['transform', 'ADBE Position'], 4);
    expect(hx).toBeCloseTo(1278.52, 2);
    expect(hy + 0.75 * X.head.size).toBeCloseTo(X.baselines[0], 6);
    const [, by] = c.at('BIO', ['transform', 'ADBE Position'], 4);
    expect(by + 0.75 * X.bio.size).toBeCloseTo(X.baselines[3], 6);
    const r = rectOf(c, 'PANEL', 'Panel', 4);
    const pk = p.layout.panel.pack;
    for (const [v, want] of [[r.x0, pk.x0], [r.x1, pk.x1], [r.y0, pk.y0], [r.y1, pk.y1]]) expect(v).toBeCloseTo(want, 4);
    expect(c.at('HEAD', ['text'], 4)).toBe(`${p.pack.TXT_NAME} - \r${p.pack.TXT_ROLE}`);
    expect(c.at('BIO', ['text'], 4).split('\r- ')).toHaveLength(3);
  });

  it('on the left: the mirror of the right; without a bio the panel ends under the head', () => {
    const c = comp({ HEAD: 3, BIO: 1 }, { ctrl: { Side: 2 }, texts: { TXT_NAME: 'Иван Петров', TXT_ROLE: 'Основатель студии', TXT_BIO1: '', TXT_BIO2: '', TXT_BIO3: '' } });
    const X = p.layout.text;
    const r = rectOf(c, 'PANEL', 'Panel', 4);
    expect(r.x0).toBeCloseTo(52.5, 6);
    expect(r.w).toBeCloseTo(p.layout.panel.w, 6);
    expect(c.at('HEAD', ['transform', 'ADBE Position'], 4)[0]).toBeCloseTo(52.5 + X.padL, 6);
    expect(c.at('BIO', ['text'], 4)).toBe('');
    // three head lines (the role wraps): the panel ends padB under the third
    const last = 51 + X.headFirst + 2 * X.head.leading;
    expect(r.y1).toBeCloseTo(last + X.padB, 6);
  });

  it('a longer head pushes the bio down by whole leadings; a long bio stops at the window bottom', () => {
    const X = p.layout.text;
    const two = comp({ HEAD: 2, BIO: 4 }).at('BIO', ['transform', 'ADBE Position'], 4)[1];
    const three = comp({ HEAD: 3, BIO: 4 }).at('BIO', ['transform', 'ADBE Position'], 4)[1];
    expect(three - two).toBeCloseTo(X.head.leading, 6);
    expect(rectOf(comp({ HEAD: 2, BIO: 60 }), 'PANEL', 'Panel', 4).y1).toBeCloseTo(1029, 6);
  });

  it('the wipe from the window edge and the words of both texts in one sweep', () => {
    const c = comp({ HEAD: 2, BIO: 10 }, { texts: p.pack });
    expect(rectOf(c, 'PANEL', 'Panel', 0).w).toBe(0);
    expect(rectOf(c, 'PANEL', 'Panel', 0.3).x1).toBeCloseTo(1867.5, 6);
    expect(rectOf(c, 'PANEL', 'Panel', 0.3).w).toBeGreaterThan(0);
    expect(rectOf(c, 'PANEL', 'Panel', 7.98).w).toBeLessThan(5);
    const start = (t, s) => c.at(t, ['selector', 'Rise', 'ADBE Text Percent Start'], s);
    expect([start('HEAD', 0.4), start('BIO', 0.4)]).toEqual([0, 0]);
    // the pack's head is six words (name, surname, the dash, a three-word role): the bio starts after them
    const words = (s) => s.split(/\s+/).filter(Boolean).length;
    const nH = words(c.at('HEAD', ['text'], 4));
    const nB = words(c.at('BIO', ['text'], 4));
    expect(nH).toBe(6);
    const tHead = 0.48 + (0.44 * nH) / (nH + nB);
    expect(start('HEAD', tHead)).toBeCloseTo(100, 6);
    expect(start('BIO', tHead)).toBeCloseTo(0, 6);
    expect([start('HEAD', 1), start('BIO', 1)]).toEqual([100, 100]);
  });
});
