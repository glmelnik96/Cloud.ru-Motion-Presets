// POD_Guest «О госте»: the guest's card of the podcast pack «О_госте» (3840x2160, FHD = / 2) — a grey panel in
// the top corner of the frame's window, wiped in from the window edge, with the guest's name and role over a
// bio of short paragraphs, whose words rise and fade in one after another. The frame round it (line, tags,
// blurred margins) is POD_Frame and the panel's «Размыть поля»; this master is the card alone, over them.
// The pack sets name and role in SB Sans Display Semibold and the bio in Regular in one box text; the master
// keeps the two styles in two box texts of the pack's width (HEAD, BIO), the bio under the last line of the
// head, the panel down to the bio's last line. Built from a declarative spec (tools/masters/jsx/build-spec.jsx);
// choices: masters/POD_Guest/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPoint } from '../../tools/dump/geometry.mjs';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { layerToCompAt, restValueAt, shapeBoxAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { addQaPatch, canonProgress, START } from '../../tools/masters/rig-plate.mjs';
import { nul, P, rectGroup, shape, Spec, text as textLayer } from '../../tools/masters/spec.mjs';
import { regions, SPEED_CTRL, timeMapJs } from '../../tools/masters/speed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'POD_Guest';
export const COMP = 'CR_POD_Guest';
const FPS = 25;
const PACK_REST = 4.0;         // «О_госте»: the card at rest 1.60–7.76 s
// the pack's card starts at 0.68 s (its frame flies in first); the master starts with the card
const SHIFT = -0.68;
const REST = 4.0;              // a moment of the hold at every speed (0,75×: 1.24–6.76 s): the ink is read there
const T = ['ADBE Transform Group'];
const PACK = { comp: 'О_госте', text: 1, panel: 'Shape Layer 1', line: 'LIne Comp 1' };
// box heights of the two texts: generous, AE hides the lines a box cannot hold
const BOX_H = { HEAD: 300, BIO: 1000 };
export const BIO_FIELDS = ['TXT_BIO1', 'TXT_BIO2', 'TXT_BIO3'];

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const near = (a, b, label, tol = 0.02) => {
  if (Math.abs(a - b) > tol) throw new Error(`${label}: ${a} against ${b}`);
  return r6(b);
};

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  return {
    guest: readJson(path.join(dumps, 'podcast', 'o_goste.json')),
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', ID, 'source-metrics.json'), 'utf8')),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

function packText(guest) {
  const L = guest.layers.find((l) => l.index === PACK.text);
  if (!L || L.type !== 'text') throw new Error('О_госте: layer 1 is not the text');
  return L;
}

// A mask path segment (keys i -> i + 1) as a canon-like { frames, bezier, t0 }: zero speeds, the pack's eases.
function maskSegment(keys, i, label) {
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const out = k0.outEase[0];
  const inn = k1.inEase[0];
  if (Math.abs(out.speed) > 1e-3 || Math.abs(inn.speed) > 1e-3) throw new Error(`${label}: mask speeds ${out.speed}, ${inn.speed}`);
  return { frames: Math.round((k1.time - k0.time) * FPS), bezier: [r6(out.influence / 100), 0, r6(1 - inn.influence / 100), 1], t0: r6(k0.time) };
}

// The pack at rest, FHD: the window (the frame line's mask), the panel in its top-right corner, the text's
// box and baselines, the two styles (style runs, measured), the rise of the words.
export function guestLayout({ guest, metrics }) {
  const line = dumpLayer(guest, PACK.line);
  const lm = layerToCompAt(guest, line, PACK_REST);
  const wv = line.masks[0].path.value.vertices.map((p) => applyPoint(lm, p).map((v) => v / 2));
  const win = { x0: r6(Math.min(...wv.map((p) => p[0]))), x1: r6(Math.max(...wv.map((p) => p[0]))), y0: r6(Math.min(...wv.map((p) => p[1]))), y1: r6(Math.max(...wv.map((p) => p[1]))) };
  const panel = dumpLayer(guest, PACK.panel);
  const pb = shapeBoxAt(guest, panel, PACK_REST);
  const box = { x0: r6(pb.x0 / 2), x1: near(pb.x1 / 2, win.x1, 'panel right edge'), y0: near(pb.y0 / 2, win.y0, 'panel top'), y1: r6(pb.y1 / 2) };
  const pm = layerToCompAt(guest, panel, PACK_REST);
  const keys = panel.masks[0].path.keys;
  const x0Of = (k) => Math.min(...k.value.vertices.map((p) => applyPoint(pm, p)[0] / 2));
  const off = r6(x0Of(keys[0]) - x0Of(keys[1]));
  let fillNode = null;
  const walk = (n) => { for (const c of n.children || []) { if (c.matchName === 'ADBE Vector Fill Color') fillNode = c; walk(c); } };
  walk(layerProp(panel, 'ADBE Root Vectors Group'));
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  near(x0Of(keys[1]), box.x0, 'mask at rest');

  const tx = packText(guest);
  const tm = layerToCompAt(guest, tx, PACK_REST);
  const row = metrics.cases.find((c) => c.comp === PACK.comp && Math.abs(c.t - PACK_REST) < 1e-6).layers[String(PACK.text)];
  const doc = restValueAt(layerProp(tx, 'ADBE Text Properties', 'ADBE Text Document'), PACK_REST);
  const paras = doc.text.split('\r');
  const blank = paras.indexOf('');
  if (blank < 1) throw new Error('О_госте: no empty line between the head and the bio');
  // baselines of the lines AE laid out (wrapped bio lines included), FHD; the empty line has none
  const lines = row.lines.map((l) => (l ? { x: r6(applyPoint(tm, [l[0], l[1]])[0] / 2), y: r6(applyPoint(tm, [l[0], l[1]])[1] / 2) } : null));
  const gapAt = lines.indexOf(null);
  if (gapAt !== blank) throw new Error(`О_госте: the empty line is line ${gapAt}, paragraph ${blank}`);
  const head = lines.slice(0, gapAt);
  const bio = lines.slice(gapAt + 1);
  const [hs, bs] = row.runs;
  if (row.runs.length !== 2 || hs.start !== 0 || bs.start !== paras.slice(0, blank + 1).join('\r').length + 1) {
    throw new Error('О_госте: the style runs no longer split head and bio at the empty line');
  }
  const scaleY = Math.hypot(tm[2], tm[3]);
  const fill = hex(hs.fill);
  const anim = layerProp(tx, 'ADBE Text Properties', 'ADBE Text Animators').children[0].children
    .find((c) => c.matchName === 'ADBE Text Animator Properties').children;
  const animValue = (mn) => anim.find((c) => c.matchName === mn).value;
  return {
    win,
    panel: { w: r6(box.x1 - box.x0), off, fill: hex(fillNode.value), pack: box },
    text: {
      padL: r6(head[0].x - box.x0),
      boxW: r6((doc.boxTextSize[0] * Math.hypot(tm[0], tm[1])) / 2),
      headFirst: r6(head[0].y - box.y0),
      gap: r6(bio[0].y - head[head.length - 1].y),
      padB: r6(box.y1 - bio[bio.length - 1].y),
      fill,
      head: { font: hs.font, size: r6((hs.size * scaleY) / 2), leading: r6((hs.leading * scaleY) / 2), tracking: hs.tracking, lines: head.length },
      bio: { font: bs.font, size: r6((bs.size * scaleY) / 2), leading: r6((bs.leading * scaleY) / 2), tracking: bs.tracking, lines: bio.length },
      rise: r6((animValue('ADBE Text Position 3D')[1] * scaleY) / 2),
      opacity: animValue('ADBE Text Opacity'),
      baselines: lines.map((l) => (l ? l.y : null)),
    },
    // the pack's own texts, for the golden comparison only (resolved here, never written to the repo)
    pack: (() => {
      const bioText = paras.slice(blank + 1).join('\r');
      const parts = bioText.split(/\r(?=- )/);
      if (parts.length > BIO_FIELDS.length) throw new Error(`О_госте: ${parts.length} bio paragraphs`);
      return {
        TXT_NAME: paras[0].replace(/\s*-\s*$/, ''), TXT_ROLE: paras.slice(1, blank).join(' '),
        ...Object.fromEntries(BIO_FIELDS.map((b, i) => [b, parts[i] || ''])),
      };
    })(),
  };
}

// The pack's curves: the panel's mask in and out, the words in one linear sweep over all of them.
export function guestTiming({ guest }) {
  const panel = dumpLayer(guest, PACK.panel);
  const keys = panel.masks[0].path.keys;
  if (keys.length !== 4) throw new Error(`О_госте: the panel mask has ${keys.length} keys`);
  const words = layerProp(packText(guest), ...START).keys;
  if (words.length !== 2 || words.some((k) => k.inInterp !== 'LINEAR' || k.outInterp !== 'LINEAR')) throw new Error('О_госте: the words are no longer one linear sweep');
  const shift = (s) => ({ ...s, t0: r6(s.t0 + SHIFT) });
  return {
    panelIn: shift(maskSegment(keys, 0, 'panel in')),
    panelOut: shift(maskSegment(keys, 2, 'panel out')),
    words: { t0: r6(words[0].time + SHIFT), t1: r6(words[1].time + SHIFT) },
    duration: r6(keys[3].time + SHIFT),
  };
}

export function resolveGuest(sources = loadSources()) {
  const { tokens } = sources;
  const base = tokens.color.base;
  const L = guestLayout(sources);
  // the panel in the pack's podcast grey (the user, 2026-10-21, for the podcast's grey card: «серым, как в пакете»)
  const hex = { black: base.black.hex, green: base.green.hex, panel: L.panel.fill };
  const tm = guestTiming(sources);
  const DURATION = tm.duration;
  const end = (s) => r6(s.t0 + s.frames / FPS);
  const introEnd = Math.max(end(tm.panelIn), tm.words.t1);
  const outroStart = tm.panelOut.t0;
  const timeMap = timeMapJs({ introEnd, outroStart });
  const reg = regions({ introEnd, outroStart, duration: DURATION, fps: FPS });
  const rig = {
    PanelIn: canonProgress(tm.panelIn, tm.panelIn.t0),
    PanelOut: canonProgress(tm.panelOut, tm.panelOut.t0),
    Words: [
      { t: tm.words.t0, v: 0, inType: 'LINEAR', outType: 'LINEAR' },
      { t: tm.words.t1, v: 1, inType: 'LINEAR', outType: 'LINEAR' },
    ],
  };

  const X = L.text;
  const style = (s, box) => ({ font: s.font, size: s.size, fill: hex.black, tracking: s.tracking, leading: s.leading, justify: 'LEFT', box });
  const headStyle = style(X.head, [X.boxW, BOX_H.HEAD]);
  const bioStyle = style(X.bio, [X.boxW, BOX_H.BIO]);
  const text = {
    TXT_NAME: { value: 'Имя Фамилия', label: 'Имя', style: { ...headStyle, box: undefined } },
    TXT_ROLE: { value: 'Должность, компания', label: 'Должность', style: { ...headStyle, box: undefined } },
    TXT_BIO1: { value: '- Где работал и чем руководил', label: 'Био, абзац 1', style: { ...bioStyle, box: undefined } },
    TXT_BIO2: { value: '- Чем занимается сейчас', label: 'Био, абзац 2', style: { ...bioStyle, box: undefined } },
    TXT_BIO3: { value: '', label: 'Био, абзац 3', style: { ...bioStyle, box: undefined } },
  };
  const ctrl = {
    Side: { label: 'Сторона', items: ['Справа', 'Слева'], value: 1 },
    Speed: SPEED_CTRL,
  };

  // Both texts are box texts with the anchor on the box's top-left corner (bdText); their first baseline is
  // 0.75 of the size under it (SB Sans Display's ascent, checked by the build's measurement). The last line of
  // a text is counted from its ink bottom in whole leadings (descenders stay under half a leading).
  const pre = [
    'var C = thisComp.layer("CTRL"), R = thisComp.layer("RIG");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    timeMap.trim(),
    'var TT = T(time);',
    'function sl(e, t) { return R.effect(e)(1).valueAtTime(t); }',
    'var left = C.effect("Side")(1).value == 2;',
    `var W = ${L.panel.w} * k, X0 = left ? ${L.win.x0} * k : ${L.win.x1} * k - W, Y0 = ${L.win.y0} * k;`,
    `function lastOf(n, boxH, size, lead) { var r = thisComp.layer(n).sourceRectAtTime(${REST}, false); if (!(r.width > 0)) { return -1; } var b = r.top + r.height + boxH / 2, f = 0.75 * size * k; return f + lead * k * Math.max(0, Math.round((b - f) / (lead * k))); }`,
    `var hTop = Y0 + ${r6(X.headFirst - 0.75 * X.head.size)} * k;`,
    `var hLast = lastOf("HEAD", ${BOX_H.HEAD}, ${X.head.size}, ${X.head.leading});`,
    `var bFirst = hLast >= 0 ? hTop + hLast + ${X.gap} * k : Y0 + ${X.headFirst} * k, bTop = bFirst - ${r6(0.75 * X.bio.size)} * k;`,
    `var bLast = lastOf("BIO", ${BOX_H.BIO}, ${X.bio.size}, ${X.bio.leading});`,
    'var last = bLast >= 0 ? bTop + bLast : (hLast >= 0 ? hTop + hLast : -1);',
    `var Y1 = last >= 0 ? Math.min(${L.win.y1} * k, last + ${X.padB} * k) : Y0;`,
    // the pack's mask slides OFF from the window edge and back: the visible part of the panel
    `var vis = last >= 0 ? Math.max(0, W - ${L.panel.off} * k * (1 - sl("PanelIn", TT) + sl("PanelOut", TT))) : 0;`,
    'var px0 = left ? X0 : X0 + W - vis, px1 = px0 + vis;',
  ].join('\n') + '\n';
  // the selectors read only the sliders and the word counts: the geometry above measures HEAD and BIO, and a
  // selector must not measure its own layer (rig-plate HAS_TEXT_JS)
  const selPre = [
    'var R = thisComp.layer("RIG");',
    timeMap.trim(),
    'var TT = T(time);',
    'function sl(e, t) { return R.effect(e)(1).valueAtTime(t); }',
  ].join('\n') + '\n';
  const wordsJs = 'function words(n) { var s = String(thisComp.layer(n).text.sourceText).split(/\\s+/), c = 0; for (var i = 0; i < s.length; i++) { if (s[i].length) { c++; } } return c; }\n' +
    'var nH = words("HEAD"), nB = words("BIO"), s = sl("Words", TT) * (nH + nB);\n';

  const spec = new Spec({ name: COMP, w: 1920, h: 1080, fps: FPS, duration: DURATION });
  // the fields: hidden layers the card's two texts are made of
  for (const t of ['TXT_BIO3', 'TXT_BIO2', 'TXT_BIO1', 'TXT_ROLE', 'TXT_NAME']) {
    spec.add(textLayer(t, { ...text[t].style, value: text[t].value }, []));
    spec.expr(t, P.opacity, '0');
  }
  spec.add(shape('PANEL', [rectGroup('Panel', hex.panel)]));
  spec.add(textLayer('BIO', { ...bioStyle, value: '' }, [{ name: 'Rise', basedOn: 3, opacity: X.opacity }]));
  spec.add(textLayer('HEAD', { ...headStyle, value: '' }, [{ name: 'Rise', basedOn: 3, opacity: X.opacity }]));
  spec.expr('PANEL', P.rectSize('Panel'), pre + '[vis, Y1 - Y0]');
  spec.expr('PANEL', P.rectPos('Panel'), pre + '[(px0 + px1) / 2, (Y0 + Y1) / 2]');
  // the head: the name, « - » and the role on the next line, as the pack typed them
  spec.expr('HEAD', P.text, 'var n = String(thisComp.layer("TXT_NAME").text.sourceText), r = String(thisComp.layer("TXT_ROLE").text.sourceText);\nn.length && r.length ? n + " - \\r" + r : n + r');
  spec.expr('BIO', P.text, `var s = [], b;\nfor (var i = 1; i <= ${BIO_FIELDS.length}; i++) { b = String(thisComp.layer("TXT_BIO" + i).text.sourceText); if (b.length) { s.push(b); } }\ns.join("\\r")`);
  spec.expr('HEAD', P.pos, pre + `[X0 + ${X.padL} * k, hTop]`);
  spec.expr('BIO', P.pos, pre + `[X0 + ${X.padL} * k, bTop]`);
  for (const t of ['HEAD', 'BIO']) {
    spec.expr(t, P.rise(), 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n' + `[0, ${X.rise} * k, 0]`);
    // one sweep over the words of both texts, the bio after the head
    spec.expr(t, P.start(), selPre + wordsJs + (t === 'HEAD' ? 'nH > 0 ? 100 * Math.min(1, Math.max(0, s / nH)) : 100' : 'nB > 0 ? 100 * Math.min(1, Math.max(0, (s - nH) / nB)) : 100'));
    spec.matte(t, 'PANEL');
  }
  addQaPatch(spec, hex.green);
  spec.add(nul('RIG', Object.keys(rig).map((name) => ({ kind: 'slider', name })), { shy: true }));
  for (const [name, keys] of Object.entries(rig)) spec.key('RIG', P.slider(name), keys);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Side', items: ctrl.Side.items, value: ctrl.Side.value },
    { kind: 'dropdown', name: 'Speed', items: ctrl.Speed.items, value: ctrl.Speed.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // AE lists the newest controller first: added in reverse of Имя, Должность, Био 1–3, Сторона, Скорость
  const fields = ['TXT_NAME', 'TXT_ROLE', ...BIO_FIELDS];
  const egp = [{ effect: 'Speed' }, { effect: 'Side' }, ...[...fields].reverse().map((t) => ({ text: t }))];
  const built = spec.toJSON();
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    hex,
    layout: { win: L.win, panel: L.panel, text: L.text },
    timing: { ...tm, introEnd, outroStart },
    text,
    pack: L.pack,
    ctrl,
    egp,
    rig,
    markers: reg.markers,
    duration: reg.duration,
    spec: {
      ...built,
      fonts: [X.head.font, X.bio.font],
      markers: reg.markers,
      egp: egp.map((e) => (e.text ? { text: e.text, label: text[e.text].label } : { effect: e.effect, matchName: 'ADBE Dropdown Control', label: ctrl[e.effect].label })),
      egpNames: [...fields.map((t) => text[t].label), ctrl.Side.label, ctrl.Speed.label],
      measure: [{ name: 'pack', t: REST, ctrl: { Side: 1 }, text: L.pack, layers: ['HEAD', 'BIO', 'PANEL'] }],
      defaults: { text: Object.fromEntries(fields.map((t) => [t, text[t].value])), ctrl: { Side: 1, Speed: 2 } },
    },
    check: Object.fromEntries(fields.map((t) => [t, text[t].value])),
    version: 1,
    variants: ['16x9', '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.2, 0.4, 0.6, 0.8, 1.0, 2.0, 4.0, 6.0, 7.2, 7.6, 7.96],
    rest: REST,
  };
}

export const resolve = resolveGuest;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveGuest();
  console.log(JSON.stringify({ layers: r.spec.order, keys: r.spec.keys.length, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length,
    layout: r.layout, timing: r.timing, markers: r.markers, duration: r.duration, pack: Object.keys(r.pack) }, null, 1).slice(0, 6000));
}
