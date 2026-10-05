// Live checks of the «Цвета» tab in After Effects (spec 7, D23): planColor and runColor through the Bridge on
// a scratch comp with shape layers (one animated, one driven by an expression), a text layer and a solid;
// the test bed reads the colours back. tests/panel/colors-live.test.mjs runs it dry on the fake.
import { hexToRgb01, planColor, runColor } from '../../panel/src/core/colors.ts';

const close = (a, b) => Array.isArray(a) && b.every((v, i) => Math.abs(Number(a[i]) - v) <= 0.002);

export const COLOR_CASES = [
  { key: 'fill', select: ['BK Shape'], token: 'green', target: 'fill', expect: { set: { 'BK Shape': 2 }, warn: [] } },
  { key: 'stroke', select: ['BK Shape', 'BK Text'], token: 'black', target: 'stroke', expect: { set: { 'BK Shape': 2 }, warn: ['COLOR_PARTIAL'] } },
  { key: 'text', select: ['BK Text'], token: 'yellow', target: 'text', expect: { set: { 'BK Text': 1 }, warn: [] } },
  { key: 'keyed', select: ['BK Keyed'], time: 5, token: 'purple', target: 'fill', expect: { set: { 'BK Keyed': 1 }, keyed: 1, warn: [] } },
  { key: 'expression', select: ['BK Expr'], token: 'green', target: 'fill', expect: { refused: 'COLOR_NO_TARGET' } },
  { key: 'solid', select: ['BK Solid'], token: 'gray', target: 'fill', expect: { set: { 'BK Solid': 1 }, warn: ['COLOR_SOLID'] } },
  { key: 'none', select: [], token: 'green', target: 'fill', expect: { refused: 'NO_SELECTION' } },
];

export async function runColorsLive(o) {
  const { bridge, hostRun, R } = o;
  const setup = R.fromHost('colors: setup', await hostRun('setup', { project: o.project, targets: [{ key: 'colors', name: 'BK colors', w: 1920, h: 1080, fps: 25, dur: 30 }] }));
  const id = setup?.ids?.colors;
  if (!id) return;
  R.fromHost('colors: layers', await hostRun('colorLayers', { id }));
  const read = async (step) => R.fromHost(step, await hostRun('colorRead', { id }))?.colors ?? {};

  for (const c of COLOR_CASES) {
    R.fromHost(`colors ${c.key}: select`, await hostRun('select', { id, names: c.select, time: c.time ?? 1 }));
    const ctx = (await bridge.call('getContext')).data;
    const plan = planColor(ctx, c.token, c.target);
    const rgb = hexToRgb01(plan.request?.hex ?? '#000000');
    if (c.expect.refused === 'NO_SELECTION') {
      R.check(`colors ${c.key}: refused before the host`, !plan.ok && plan.problems[0]?.code === 'NO_SELECTION', plan.problems);
      const direct = await bridge.call('applyColor', { ...planColor({ ...ctx, selection: 1 }, c.token, c.target).request }, { mutating: true });
      R.check(`colors ${c.key}: the adapter refuses too`, direct.error?.code === 'NO_SELECTION', direct);
      continue;
    }
    if (!R.check(`colors ${c.key}: planned`, plan.ok, plan.problems)) continue;
    const before = await read(`colors ${c.key}: read before`);
    const out = await runColor(bridge, plan.request);
    const after = await read(`colors ${c.key}: read`);
    if (c.expect.refused) {
      R.check(`colors ${c.key}: refused (${c.expect.refused}), the expression named`, !out.ok && out.problems.map((p) => p.code).join() === 'COLOR_NO_TARGET,COLOR_EXPRESSION', out.problems);
      R.check(`colors ${c.key}: nothing changed`, JSON.stringify(after['BK Expr']) === JSON.stringify(before['BK Expr']), { before: before['BK Expr'], after: after['BK Expr'] });
      continue;
    }
    const set = Object.fromEntries((out.reply?.layers ?? []).filter((l) => l.set > 0).map((l) => [l.name, l.set]));
    R.check(`colors ${c.key}: properties set ${JSON.stringify(c.expect.set)}`, out.ok && JSON.stringify(set) === JSON.stringify(c.expect.set), out);
    R.check(`colors ${c.key}: warnings ${c.expect.warn.join(', ') || 'none'}`, out.problems.map((p) => p.code).join() === c.expect.warn.join(), out.problems);
    if (c.key === 'fill') {
      const a = after['BK Shape'];
      R.check('colors fill: both rectangles green, alpha kept, strokes untouched', a && a.fills.every((f) => close(f, [...rgb, 1])) && a.strokes.every((f) => close(f, [0, 0, 1, 1])), a);
    }
    if (c.key === 'stroke') R.check('colors stroke: both strokes #222222', after['BK Shape']?.strokes.every((f) => close(f, [...rgb, 1])), after['BK Shape']);
    if (c.key === 'text') R.check('colors text: the text is #CFF500', close(after['BK Text']?.text, rgb), after['BK Text']);
    if (c.key === 'keyed') {
      const k = after['BK Keyed'];
      R.check('colors keyed: a third key at 5 s, the colour there is #A068FF', k && k.fillKeys === 3 && close(k.fills[0], [...rgb, 1]) && out.reply.layers[0].keyed === 1, k);
    }
    if (c.key === 'solid') R.check('colors solid: the solid is #F2F2F2', close(after['BK Solid']?.solid, rgb), after['BK Solid']);
  }
  R.fromHost('colors: save', await hostRun('save', {}));
}
