// POD_Frame «Рамка подкаста»: the frame of the podcast pack over a whole episode — a thin light line round the
// window of the shot (52.5 px in from the frame edges, FHD) that flies in and out along Z (canon M8), and the
// corner tags «CLOUD.RU» and «ПОДКАСТ» on green plates, wiped in from the window's edge while their words rise.
// From «Контент_1» and its precomps «LIne Comp 1», «Cloud.ru», «Подкаст» (3840x2160, FHD = / 2).
// Z is drawn as a scale from the centre: a flat layer parallel to the frame under the centred 50 mm camera
// (zoom = width · 50 / 36) is that scale, s = 1 / (1 + Z / zoom), and the MOGRT stays 2-D.
// The blur of the margins is the panel's «Размыть поля» (D11): a MOGRT cannot blur the video under it in
// Premiere. Built from a declarative spec (tools/masters/jsx/build-spec.jsx); choices: masters/POD_Frame/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { restValueAt, shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpKeys, dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { addQaPatch, canonProgress, checkCanon, clearOffset, lineAt } from '../../tools/masters/rig-plate.mjs';
import { nul, P, rectGroup, shape, Spec, text as textLayer } from '../../tools/masters/spec.mjs';
import { regions, SPEED_CTRL, timeMapJs } from '../../tools/masters/speed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'POD_Frame';
export const COMP = 'CR_POD_Frame';
const FPS = 25;
const DURATION = 10;
const PACK_REST = 4.0;         // «Контент_1»: frame and tags at rest 1.72–7.60 s
// the pack's exit (tags from 7.60 s, frame 8.60–9.64 s) moved to end on the last frame
const OUT_SHIFT = 0.32;
// a moment of the hold at every speed (0,75×: 2.32–7.20 s, 2×: 0.86–8.96 s): the ink of the tags is read there
const REST = 4.0;
const ZOOM = 50 / 36;          // a 50 mm camera on 36 mm film: zoom = width · 50 / 36
const T = ['ADBE Transform Group'];
// [layer in «Контент_1», its precomp item id, the text, the plate]
const TAGS = {
  top: { layer: 'Cloud.ru', id: 2172, text: 'CLOUD.RU', plate: 'Cube_3' },
  bot: { layer: 'Подкаст', id: 2147, text: 'ПОДКАСТ', plate: 'Cube_2' },
};

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const mean = (list) => r6(list.reduce((s, v) => s + v, 0) / list.length);

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    kontent: readJson(path.join(dumps, 'podcast', 'kontent_1.json')),
    line: readJson(path.join(dumps, 'podcast', 'line_comp_1_2.json')),
    top: readJson(path.join(dumps, 'podcast', 'cloud_ru_2.json')),
    bot: readJson(path.join(dumps, 'podcast', 'podkast_2.json')),
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', ID, 'source-metrics.json'), 'utf8')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

// The rising animator of a tag text: the pack keys its third animator's Position.
function riseKeys(dump, textName) {
  const anims = layerProp(dumpLayer(dump, textName), 'ADBE Text Properties', 'ADBE Text Animators').children;
  for (const a of anims) {
    const p = a.children.find((c) => c.matchName === 'ADBE Text Animator Properties').children.find((c) => c.matchName === 'ADBE Text Position 3D');
    if (p && p.keys && p.keys.length) return p.keys;
  }
  throw new Error(`${textName}: no keyed Position animator`);
}

// A mask path segment as a canon-like { frames, bezier }: its eases (the vertices move ~750 px/s; the pack's
// speeds of 0.9–1.2 are hand-dragged handles).
function maskSegment(keys, i, label) {
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const out = k0.outEase[0];
  const inn = k1.inEase[0];
  if (Math.abs(out.speed) > 2 || Math.abs(inn.speed) > 2) throw new Error(`${label}: mask speeds ${out.speed}, ${inn.speed}`);
  return { frames: Math.round((k1.time - k0.time) * FPS), bezier: [r6(out.influence / 100), 0, r6(1 - inn.influence / 100), 1], t0: r6(k0.time) };
}

// The window, the line and the tags at rest, FHD. A tag's precomp layer only moves its precomp (scale 100 %,
// parented to «LIne Comp 1», which rests at the centre).
export function frameLayout({ kontent, line, top, bot, metrics }) {
  const L = dumpLayer(line, 'LIne');
  const rect = layerProp(L, 'ADBE Root Vectors Group').children[0].children.find((c) => c.matchName === 'ADBE Vectors Group').children
    .find((c) => c.matchName === 'ADBE Vector Shape - Rect');
  const size = rect.children.find((c) => c.matchName === 'ADBE Vector Rect Size').value;
  const stroke = (() => {
    let keys = null;
    const walk = (n) => { for (const c of n.children || []) { if (c.matchName === 'ADBE Vector Stroke Width' && c.keys) keys = c.keys; walk(c); } };
    walk(layerProp(L, 'ADBE Root Vectors Group'));
    return keys;
  })();
  const tag = (dump, t) => {
    const layer = dumpLayer(kontent, t.layer);
    const pos = restValueAt(layerProp(layer, ...T, 'ADBE Position'), PACK_REST);
    const anc = restValueAt(layerProp(layer, ...T, 'ADBE Anchor Point'), PACK_REST);
    const dx = (pos[0] - anc[0]) / 2;
    const ln = lineAt(dump, metrics, t.text, t.plate, PACK_REST);
    const box = shapeBoxAt(dump, dumpLayer(dump, t.plate), PACK_REST);
    const rk = riseKeys(dump, t.text);
    const scaleY = restValueAt(layerProp(dumpLayer(dump, t.text), ...T, 'ADBE Scale'), PACK_REST)[1] / 100;
    return {
      x0: r6(ln.plate.x0 + dx), x1: r6(ln.plate.x1 + dx), y0: ln.plate.y0, y1: ln.plate.y1, h: ln.plate.h,
      padL: r6(ln.ink.x0 - ln.plate.x0), padR: r6(ln.plate.x1 - ln.ink.x1),
      base: r6(ln.plate.y1 - ln.baseline),
      font: ln.font, size: ln.size, tracking: ln.tracking,
      rise: r6((rk[0].value[1] * scaleY) / 2),
      boxH: r6(box.h / 2),
    };
  };
  const tTop = tag(top, TAGS.top);
  const tBot = tag(bot, TAGS.bot);
  // the masks of the tags reach below their plates (the Д of «ПОДКАСТ» hangs out): the band of «Подкаст»
  const botMask = dumpLayer(kontent, TAGS.bot.layer).masks[0].path.keys[1].value.vertices;
  const band = r6((Math.max(...botMask.map((v) => v[1])) - tBot.y1 * 2) / 2);
  return {
    halfW: r6(size[0] / 4), halfH: r6(size[1] / 4),
    line: { rest: r6(stroke[stroke.length - 1].value / 4), start: r6(stroke[0].value / 4) },
    tags: {
      h: mean([tTop.h, tBot.h]), pad: mean([tTop.padL, tTop.padR, tBot.padL, tBot.padR]),
      base: mean([tTop.base, tBot.base]), band,
      font: tTop.font, size: tTop.size, tracking: tTop.tracking,
      rise: { top: tTop.rise, bot: tBot.rise },
      pack: { top: tTop, bot: tBot },
    },
  };
}

// Times of the pack: the frame on canon M8 (checked against «Контент_1»), the tags on their own mask wipes
// and rises; every exit OUT_SHIFT later.
export function frameTiming({ kontent, line, top, bot }, canon) {
  const M8 = canon.M8;
  const z = dumpKeys(kontent, 'LIne Comp 1', ...T, 'ADBE Position');
  checkCanon(z, 0, M8.in, { dim: 0, label: 'frame Z in' });
  checkCanon(z, 2, M8.out, { dim: 0, label: 'frame Z out' });
  const L = dumpLayer(line, 'LIne');
  let sw = null;
  const walk = (n) => { for (const c of n.children || []) { if (c.matchName === 'ADBE Vector Stroke Width' && c.keys) sw = c.keys; walk(c); } };
  walk(layerProp(L, 'ADBE Root Vectors Group'));
  checkCanon(sw, 0, M8.stroke, { label: 'frame stroke' });
  const wipe = (t) => {
    const keys = dumpLayer(kontent, t.layer).masks[0].path.keys;
    return { in: maskSegment(keys, 0, `${t.layer} wipe in`), out: maskSegment(keys, 2, `${t.layer} wipe out`) };
  };
  const rise = (dump, t) => {
    const keys = riseKeys(dump, t.text);
    const k0 = keys[0];
    const k1 = keys[1];
    return { frames: Math.round((k1.time - k0.time) * FPS), bezier: [r6(k0.outEase[0].influence / 100), 0, r6(1 - k1.inEase[0].influence / 100), 1], t0: r6(k0.time) };
  };
  return {
    fly: { in: { ...M8.in, t0: r6(z[0].time) }, out: { ...M8.out, t0: r6(z[2].time + OUT_SHIFT) }, fromZ: z[0].value[2], toZ: z[3].value[2] },
    thin: { ...M8.stroke, t0: r6(sw[0].time) },
    top: { wipe: wipe(TAGS.top), rise: rise(top, TAGS.top) },
    bot: { wipe: wipe(TAGS.bot), rise: rise(bot, TAGS.bot) },
  };
}

export function resolveFrame(sources = loadSources()) {
  const { tokens } = sources;
  const base = tokens.color.base;
  const hex = { black: base.black.hex, green: base.green.hex, gray: base.gray.hex };
  const L = frameLayout(sources);
  const tm = frameTiming(sources, tokens.motion);
  const shiftOut = (s) => ({ ...s, t0: r6(s.t0 + OUT_SHIFT) });
  const seg = {
    FlyIn: tm.fly.in, FlyOut: tm.fly.out, Thin: tm.thin,
    TopWipeIn: tm.top.wipe.in, TopWipeOut: shiftOut(tm.top.wipe.out), TopRise: tm.top.rise,
    BotWipeIn: tm.bot.wipe.in, BotWipeOut: shiftOut(tm.bot.wipe.out), BotRise: tm.bot.rise,
  };
  const rig = Object.fromEntries(Object.entries(seg).map(([name, s]) => [name, canonProgress(s, s.t0)]));
  const end = (s) => r6(s.t0 + s.frames / FPS);
  const introEnd = Math.max(...['FlyIn', 'Thin', 'TopWipeIn', 'TopRise', 'BotWipeIn', 'BotRise'].map((n) => end(seg[n])));
  const outroStart = Math.min(seg.TopWipeOut.t0, seg.BotWipeOut.t0, seg.FlyOut.t0);
  const timeMap = timeMapJs({ introEnd, outroStart });
  const reg = regions({ introEnd, outroStart, duration: DURATION, fps: FPS });
  // Z of the pack's 3840 frame relative to the camera's zoom: the same in every format
  const zr = (z) => r6(z / (3840 * ZOOM));

  const tagStyle = { font: L.tags.font, size: L.tags.size, fill: hex.black, tracking: L.tags.tracking, justify: 'LEFT' };
  const text = {
    TXT_TAG_TOP: { value: 'CLOUD.RU', label: 'Тег сверху', style: tagStyle },
    TXT_TAG_BOTTOM: { value: 'ПОДКАСТ', label: 'Тег снизу', style: tagStyle },
  };
  const ctrl = {
    Side: { label: 'Сторона тегов', items: ['Справа', 'Слева'], value: 1 },
    Speed: SPEED_CTRL,
  };

  const pre = [
    'var C = thisComp.layer("CTRL"), R = thisComp.layer("RIG");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    'var W = thisComp.width, H = thisComp.height, cx = W / 2, cy = H / 2;',
    'var left = C.effect("Side")(1).value == 2;',
    timeMap.trim(),
    'var TT = T(time);',
    'function sl(e, t) { return R.effect(e)(1).valueAtTime(t); }',
    // the fly: Z relative to the zoom, drawn as a scale from the centre
    `var zr = ${zr(tm.fly.fromZ)} * (1 - sl("FlyIn", TT)) + ${zr(tm.fly.toZ)} * sl("FlyOut", TT), s = 1 / (1 + zr);`,
    'function F(x, y) { return [cx + (x - cx) * s, cy + (y - cy) * s]; }',
    `var X0 = cx - ${L.halfW} * k, X1 = cx + ${L.halfW} * k, Y0 = cy - ${L.halfH} * k, Y1 = cy + ${L.halfH} * k;`,
  ].join('\n') + '\n';
  // the line: the inner band of the pack's stroke inside the window (its outer half is masked off), 25 -> 3 px
  const lineJs = pre + `var sw = (${L.line.rest} + ${r6(L.line.start - L.line.rest)} * (1 - sl("Thin", TT))) * k;\n`;
  const bars = {
    Top: ['(X0 + X1) / 2', 'Y0 + sw / 2', 'X1 - X0', 'sw'],
    Bottom: ['(X0 + X1) / 2', 'Y1 - sw / 2', 'X1 - X0', 'sw'],
    Left: ['X0 + sw / 2', '(Y0 + Y1) / 2', 'sw', 'Y1 - Y0'],
    Right: ['X1 - sw / 2', '(Y0 + Y1) / 2', 'sw', 'Y1 - Y0'],
  };
  // a tag: on the window edge of its side, 66 px tall, its text's ink PAD in from both plate ends, the
  // baseline on the plate bottom; wiped in and out from the window edge, the clip (its text's matte) reaches
  // BAND under the plate for descenders
  const tagJs = (layer, top, wipe) => pre + [
    `var r = thisComp.layer("${layer}").sourceRectAtTime(${REST}, false);`,
    `var w = r.width > 0 ? r.width + 2 * ${L.tags.pad} * k : 0, th = ${L.tags.h} * k;`,
    `var y1 = ${top ? `Y0 + th` : 'Y1'}, y0 = y1 - th, x1 = left ? X0 + w : X1, x0 = x1 - w;`,
    `var g = sl("${wipe}In", TT) * (1 - sl("${wipe}Out", TT));`,
    'var gx0 = left ? x0 : x1 - w * g, gx1 = left ? x0 + w * g : x1;',
  ].join('\n') + '\n';

  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: DURATION });
  spec.add(shape('LINE', Object.keys(bars).map((b) => rectGroup(b, hex.gray))));
  for (const [b, [x, y, w, h]] of Object.entries(bars)) {
    spec.expr('LINE', P.rectSize(b), lineJs + `[(${w}) * s, (${h}) * s]`);
    spec.expr('LINE', P.rectPos(b), lineJs + `F(${x}, ${y})`);
  }
  for (const [tag, top, wipe, rise, name] of [['TXT_TAG_BOTTOM', false, 'BotWipe', 'BotRise', 'BOT'], ['TXT_TAG_TOP', true, 'TopWipe', 'TopRise', 'TOP']]) {
    const plate = `PL_${name}`;
    const clip = `CL_${name}`;
    spec.add(shape(clip, [rectGroup('Clip', hex.green)]), shape(plate, [rectGroup('Plate', hex.green)]));
    spec.add(textLayer(tag, { ...tagStyle, value: text[tag].value }, [{ name: 'Rise', basedOn: 1 }]));
    const js = tagJs(tag, top, wipe);
    spec.expr(plate, P.rectSize('Plate'), js + '[Math.max(0, gx1 - gx0) * s, th * s]');
    spec.expr(plate, P.rectPos('Plate'), js + 'F((gx0 + gx1) / 2, (y0 + y1) / 2)');
    spec.expr(clip, P.rectSize('Clip'), js + `[Math.max(0, gx1 - gx0) * s, (th + ${L.tags.band} * k) * s]`);
    spec.expr(clip, P.rectPos('Clip'), js + `F((gx0 + gx1) / 2, (y0 + y1 + ${L.tags.band} * k) / 2)`);
    // capitals by expression: the pack typed them (All Caps would space SB Sans Display wider, cpsp)
    spec.expr(tag, P.text, 'String(value).toUpperCase()');
    spec.expr(tag, P.pos, js + `F(x0 + ${L.tags.pad} * k - r.left, y1 - ${L.tags.base} * k)`);
    spec.expr(tag, P.scale, js + '[100 * s, 100 * s]');
    // the whole text rises (the pack's Position animator), in layer units; it waits out of the clip, which
    // opens before the rise: the pack's 72–77 px left the tops of Й, Ё and Å 8–12 px in it (2026-10-23)
    const k = 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n';
    const hide = Math.max(L.tags.rise[top ? 'top' : 'bot'], clearOffset(L.tags.band + L.tags.base, tagStyle));
    spec.expr(tag, P.rise(), k + timeMap + `var p = thisComp.layer("RIG").effect("${rise}")(1).valueAtTime(T(time));\n[0, ${hide} * k * (1 - p), 0]`);
    spec.matte(tag, clip, 'ALPHA', { keepVisible: false });
  }
  addQaPatch(spec, hex.green);
  spec.add(nul('RIG', Object.keys(rig).map((name) => ({ kind: 'slider', name })), { shy: true }));
  for (const [name, keys] of Object.entries(rig)) spec.key('RIG', P.slider(name), keys);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Side', items: ctrl.Side.items, value: ctrl.Side.value },
    { kind: 'dropdown', name: 'Speed', items: ctrl.Speed.items, value: ctrl.Speed.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // AE lists the newest controller first: added in reverse of Тег сверху, Тег снизу, Сторона тегов, Скорость
  const egp = [{ effect: 'Speed' }, { effect: 'Side' }, { text: 'TXT_TAG_BOTTOM' }, { text: 'TXT_TAG_TOP' }];
  const built = spec.toJSON();
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    hex,
    layout: L,
    timing: { ...tm, introEnd, outroStart },
    text,
    ctrl,
    egp,
    rig,
    markers: reg.markers,
    duration: reg.duration,
    spec: {
      ...built,
      fonts: [L.tags.font],
      markers: reg.markers,
      egp: egp.map((e) => (e.text ? { text: e.text, label: text[e.text].label } : { effect: e.effect, matchName: 'ADBE Dropdown Control', label: ctrl[e.effect].label })),
      egpNames: [text.TXT_TAG_TOP.label, text.TXT_TAG_BOTTOM.label, ctrl.Side.label, ctrl.Speed.label],
      measure: [{ name: 'pack', t: REST, ctrl: { Side: 1 }, text: { TXT_TAG_TOP: 'CLOUD.RU', TXT_TAG_BOTTOM: 'ПОДКАСТ' }, layers: ['PL_TOP', 'PL_BOT', 'TXT_TAG_TOP', 'TXT_TAG_BOTTOM'] }],
      defaults: { text: { TXT_TAG_TOP: text.TXT_TAG_TOP.value, TXT_TAG_BOTTOM: text.TXT_TAG_BOTTOM.value }, ctrl: { Side: 1, Speed: 2 } },
    },
    check: { TXT_TAG_TOP: 'CLOUD.RU', TXT_TAG_BOTTOM: 'ПОДКАСТ' },
    version: 1,
    variants: ['16x9', '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.2, 0.4, 0.6, 0.9, 1.2, 1.5, 1.7, 4.0, 8.0, 8.4, 8.8, 9.2, 9.6, 9.96],
    rest: REST,
  };
}

export const resolve = resolveFrame;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveFrame();
  console.log(JSON.stringify({ layers: r.spec.order, keys: r.spec.keys.length, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length,
    layout: r.layout, timing: r.timing, markers: r.markers, duration: r.duration }, null, 1).slice(0, 7000));
}
