// «Цвета» in After Effects (panel/src/core/colors.ts, applyColor of panel/host/ae.jsx) on the AE fake: a brand
// token onto shape fills and solids, shape strokes or text fill of the selected layers, a key at the current
// time where the colour is animated, colours driven by expressions left alone and named.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeHost } from '../../panel/host/compose.mjs';
import { Bridge } from '../../panel/src/bridge/bridge.ts';
import { hexToRgb01, palette, planColor, runColor } from '../../panel/src/core/colors.ts';

const FAKE_AE = readFileSync(new URL('./fake-ae.js', import.meta.url), 'utf8');
const BUNDLE = composeHost();
const GREEN = [0.14902, 0.815686, 0.486275];

function ae(select, opts = {}) {
  const ctx = vm.createContext({});
  vm.runInContext(FAKE_AE, ctx);
  vm.runInContext(BUNDLE, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  ctx.__opts = opts;
  run(`__ae.userComp(1920, 1080, 25, 5);
    var __c = app.project.activeItem;
    __ae.addLayer(__c, 'Плашка', 'shape', __opts.shape || { groups: 2 });
    __ae.addLayer(__c, 'Имя', 'text', __opts.textLayer || {});
    __c.layers.addSolid([1, 1, 1], 'Фон', 1920, 1080, 1, 60);`);
  ctx.__sel = select;
  run(`app.project.activeItem._layers.forEach(function (l) { l.selected = __sel.indexOf(l.name) >= 0; })`);
  const bridge = new Bridge({ evalScript: async (s) => String(run(s)) });
  return { run, bridge, ctx: async () => (await bridge.call('getContext')).data };
}

const paint = async (h, token, target) => runColor(h.bridge, planColor(await h.ctx(), token, target).request);
const layer = (h, name) => `app.project.activeItem._layers.filter(function (l) { return l.name === ${JSON.stringify(name)}; })[0]`;

describe('palette', () => {
  it('is the base palette of the brand tokens, in 0..1 for AE', () => {
    expect(palette().map((s) => s.key)).toEqual(['green', 'black', 'white', 'gray', 'yellow', 'purple', 'blue']);
    expect(hexToRgb01('#26D07C')).toEqual(GREEN);
    expect(hexToRgb01('#222222')).toEqual([0.133333, 0.133333, 0.133333]);
  });

  it('needs AE, a comp, a selection and a known token', async () => {
    const ctx = await ae(['Плашка']).ctx();
    expect(planColor(ctx, 'green', 'fill')).toMatchObject({ ok: true, request: { hex: '#26D07C', rgb: GREEN, target: 'fill', undoLabel: 'BrandKit: заливка #26D07C' } });
    expect(planColor({ ...ctx, selection: 0 }, 'green', 'fill').problems.map((p) => p.code)).toEqual(['NO_SELECTION']);
    expect(planColor({ ...ctx, host: 'pr' }, 'green', 'fill').problems.map((p) => p.code)).toEqual(['NOT_SUPPORTED']);
    expect(planColor(ctx, 'aquamarine', 'fill').problems.map((p) => p.code)).toEqual(['BAD_VALUE']);
  });
});

describe('applyColor', () => {
  it('fills every Fill of a shape layer, strokes stay, in one undo group', async () => {
    const h = ae(['Плашка']);
    const out = await paint(h, 'green', 'fill');
    expect(out).toMatchObject({ ok: true, problems: [] });
    expect(out.reply.layers).toEqual([{ name: 'Плашка', set: 2, keyed: 0, expressions: [] }]);
    expect(h.run(`${layer(h, 'Плашка')}._contents.property(1).property(1).property(1).property(1).value`)).toEqual(GREEN);
    expect(h.run(`${layer(h, 'Плашка')}._contents.property(1).property(1).property(2).property(1).value`)).toEqual([0, 0, 1]);
    expect(h.run('__ae.undo')).toEqual(['begin BrandKit: заливка #26D07C', 'end']);
  });

  it('strokes, and text fill of a text layer', async () => {
    const h = ae(['Плашка', 'Имя']);
    const stroke = await paint(h, 'black', 'stroke');
    expect(stroke.reply.layers.map((l) => [l.name, l.set])).toEqual([['Имя', 0], ['Плашка', 2]]);
    expect(stroke.problems.map((p) => [p.code, p.message])).toEqual([['COLOR_PARTIAL', 'У слоёв Имя нет обводки — они не изменились.']]);
    const text = await paint(h, 'yellow', 'text');
    expect(text.reply.layers.map((l) => [l.name, l.set])).toEqual([['Имя', 1], ['Плашка', 0]]);
    expect(h.run(`${layer(h, 'Имя')}._sourceText.value.fillColor`)).toEqual(hexToRgb01('#CFF500'));
  });

  it('keys an animated colour at the current time and leaves an expression alone', async () => {
    const h = ae(['Плашка'], { shape: { groups: 1, fill: { keys: [0, 2] } } });
    const keyed = await paint(h, 'purple', 'fill');
    expect(keyed.reply.layers[0]).toMatchObject({ set: 1, keyed: 1 });
    expect(h.run('__ae.calls').filter((c) => c.startsWith('key'))).toEqual(['key ADBE Vector Fill Color @5']);
    const h2 = ae(['Плашка'], { shape: { groups: 1, fill: { expression: 'thisComp.layer("Цвет").effect(1)(1)' } } });
    const exp = await paint(h2, 'purple', 'fill');
    expect(exp.ok).toBe(false);
    expect(exp.problems.map((p) => p.code)).toEqual(['COLOR_NO_TARGET', 'COLOR_EXPRESSION']);
    expect(exp.problems[1].message).toBe('Цвет задан выражением, не изменён: Плашка: Rectangle 1 / Contents / Fill 1 / Color.');
  });

  it('changes a solid in its settings and says that every layer of that solid follows', async () => {
    const h = ae(['Фон']);
    const out = await paint(h, 'gray', 'fill');
    expect(out.reply.layers).toEqual([{ name: 'Фон', set: 1, keyed: 0, expressions: [], solid: true }]);
    expect(out.problems.map((p) => p.code)).toEqual(['COLOR_SOLID']);
    expect(h.run(`${layer(h, 'Фон')}.source.mainSource.color`)).toEqual(hexToRgb01('#F2F2F2'));
  });

  it('refuses without a selection in the host too', async () => {
    const h = ae(['Плашка']);
    const req = planColor(await h.ctx(), 'green', 'fill').request;
    h.run('app.project.activeItem._layers.forEach(function (l) { l.selected = false; })');
    const out = await runColor(h.bridge, req);
    expect(out.problems.map((p) => p.code)).toEqual(['NO_SELECTION']);
    expect(h.run('__ae.undo')).toEqual([]);
  });
});
