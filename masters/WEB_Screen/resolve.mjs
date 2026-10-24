// WEB_Screen «Экран вебинара»: the four screens of the webinars pack («Заставка/Таймер с вижуалом/со спикером»,
// 1920x1080) as one T1 template over its background, the companion loop BG_WebinarPortal (spec 5: «T1 (trim) +
// компаньон: фон T2»). On the portal the template puts:
// - the header: the pack's «Логоблок с челкой» moved over (spec.transplant), its running hatching and descriptor,
//   with the master logo (D18) where the pack has its own;
// - the title of up to three lines, the QR — a Media Replacement slot (C28) whose default is the pack's channel QR
//   (D7) as vector shapes — and its caption;
// - «Раскладка»: the visual (a photo or video slot in the pack's window, a neutral card by default, D13) or the
//   speaker (a photo slot with a neutral silhouette, D21) with the name and the role on dark plates;
// - «Таймер»: «начало через» and the countdown from «Минуты» (1–15) to the end state «Начинаем» (D8); the minutes
//   set the clip's length (drivesDuration: minutes × 60 s + 5 s of «Начинаем»).
// A slot that takes video makes the master `trim` (C23): the comp is 15 min 5 s, the panel cuts the clip. Built from
// a declarative spec (tools/masters/jsx/build-spec.jsx); choices: masters/WEB_Screen/README.md.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPoint, bbox, multiply, samplePolyline } from '../../tools/dump/geometry.mjs';
import { layerProp, readJson } from '../../tools/dump/model.mjs';
import { packProject } from '../../tools/dump/dump.mjs';
import { workDir, workPath } from '../../tools/lib/work.mjs';
import { layerToCompAt, restValueAt, shapeBoxAt, shapePathsAt } from '../../tools/masters/dump-geometry.mjs';
import { dumpLayer } from '../../tools/masters/dump-keys.mjs';
import { fitCube, masterLockup } from '../../tools/masters/logo.mjs';
import { addQaPatch, HAS_TEXT_JS } from '../../tools/masters/rig-plate.mjs';
import { nul, P, pathGroup, precomp, shape, slot, Spec, text as textLayer } from '../../tools/masters/spec.mjs';
import { LAYOUTS } from '../BG_WebinarPortal/resolve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');

export const ID = 'WEB_Screen';
export const COMP = 'CR_WEB_Screen';
const FPS = 25;
export const MINUTES = { min: 1, max: 15, value: 5 };
const OUTRO_SEC = 5;           // «Начинаем» after the countdown (D8)
const HOLD_SEC = 25;           // without the timer: 30 s, the length of the pack's screen savers
const MAX_SEC = MINUTES.max * 60 + OUTRO_SEC;
const PACK_T = 5;              // the moment of the dumps and of the ink (the screens are still)
const REST = 1;                // a still moment: the ink of the texts is read there
const QR_SLOT = 512;           // the QR slot's placeholder comp, 4x the QR on an FHD screen
const OVERSAMPLE = 2;          // the visual and photo placeholders: twice the window, sharp in 4K
const TITLE_STYLE = 60;        // the pack's title size, which tells its text layer
export const TITLE = ['TXT_TITLE1', 'TXT_TITLE2', 'TXT_TITLE3'];
export const SPEAKER = ['TXT_SPK1', 'TXT_SPK2', 'TXT_SPK3'];
export const CAPTION = ['TXT_QR1', 'TXT_QR2'];
// the pack's screens (dump slugs)
export const SCREENS = { visual: 'zastavka_s_vizhualom', visualTimer: 'taymer_s_vizhualom', speaker: 'zastavka_so_spikerom', speakerTimer: 'taymer_so_spikerom' };
const HEADER = { name: 'Логоблок с челкой', w: 1920, h: 1080, layers: 4 };
const HATCH = 'Shape Layer 4';
const HATCH_CYCLE = 6;         // the hatching drifts 0.5 lines a second: 3 whole lines in 6 s, no seam

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const mean = (list) => r6(list.reduce((s, v) => s + v, 0) / list.length);
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const js = (v) => JSON.stringify(v);
const same = (list, what, tol = 0.01) => {
  if (list.some((v) => Math.abs(v - list[0]) > tol)) throw new Error(`${what} differs between the screens: ${list.join(', ')}`);
  return r6(list[0]);
};

export function loadSources({ dumps = 'C:/CRBK/work/dumps', repo = REPO } = {}) {
  const web = (f) => readJson(path.join(dumps, 'webinars', f + '.json'));
  return {
    screens: Object.fromEntries(Object.entries(SCREENS).map(([k, f]) => [k, web(f)])),
    header: web('logoblok_s_chelkoy'),
    logo: web('logo'),
    timer: web('timer_precomp'),
    speaker: web('spiker'),
    rack: web('pattern_rack'),
    metrics: JSON.parse(readFileSync(path.join(repo, 'masters', ID, 'source-metrics.json'), 'utf8')),
    svg: readFileSync(path.join(repo, 'brand', 'logo', 'master-ae-motion-live.svg'), 'utf8'),
    tokens: JSON.parse(readFileSync(path.join(repo, 'brand', 'tokens.json'), 'utf8')),
  };
}

const find = (node, mn, out = []) => {
  if (node.enabled !== false && node.matchName === mn) out.push(node);
  if (node.enabled !== false) for (const c of node.children || []) find(c, mn, out);
  return out;
};
const fillOf = (layer) => hex(find(layerProp(layer, 'ADBE Root Vectors Group'), 'ADBE Vector Fill Color')[0].value);
const docOf = (layer) => restValueAt(layerProp(layer, 'ADBE Text Properties', 'ADBE Text Document'), PACK_T);
const inkOf = (metrics, dump, layer) => {
  const c = metrics.cases.find((x) => x.comp === dump.comp.name);
  const row = c && c.layers[String(layer.index)];
  if (!row) throw new Error(`source-metrics.json: no ${dump.comp.name} layer #${layer.index}`);
  return row;
};
const probeOf = (metrics, text, size) => {
  const p = metrics.probe.find((x) => x.text === text && x.fontSize === size);
  if (!p) throw new Error(`source-metrics.json: no probe of «${text}» at ${size} px`);
  return p;
};
const boxOf = (sps) => {
  const b = bbox(sps.flatMap((sp) => samplePolyline(sp)));
  return { x0: r6(b.x0), y0: r6(b.y0), x1: r6(b.x1), y1: r6(b.y1) };
};
// the paths of some top-level groups of a shape layer, in comp coordinates
const groupPaths = (dump, layer, groups) => shapePathsAt(dump, { ...layer, props: layer.props.map((n) => (n.matchName === 'ADBE Root Vectors Group' ? { ...n, children: groups } : n)) }, PACK_T);
const area = (sp) => sp.vertices.reduce((s, p, i) => { const q = sp.vertices[(i + 1) % sp.vertices.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

// The QR of the screens (outlines «Layer 7 Outlines 2»): its modules and the caption's two lines. Each module group of
// the pack intersects its shapes with the QR's square (Merge Paths): the square is left out, the shapes are inside it
// already. Holes (the finder rings, the plane of the Telegram logo) wind against their outlines: one fill, non-zero.
export function qrModel(dump) {
  const L = dump.layers.find((l) => /^Layer 7 Outlines/.test(l.name));
  const root = layerProp(L, 'ADBE Root Vectors Group');
  const groups = root.children.filter((g) => g.matchName === 'ADBE Vector Group' && g.enabled !== false);
  const paths = groups.map((g) => ({ g, sps: groupPaths(dump, L, [g]) }));
  const square = paths.flatMap((x) => x.sps).filter((sp) => sp.vertices.length === 4 && Math.abs(area(sp)) > 10000);
  const sq = boxOf(square);
  if (square.length < 10 || Math.abs((sq.x1 - sq.x0) - (sq.y1 - sq.y0)) > 0.1) throw new Error('the QR has no square of its own');
  const inside = (b) => b.x0 >= sq.x0 - 0.5 && b.x1 <= sq.x1 + 0.5 && b.y0 >= sq.y0 - 0.5 && b.y1 <= sq.y1 + 0.5;
  const modules = [];
  const caption = [];
  for (const { g, sps } of paths) {
    const own = sps.filter((sp) => !square.includes(sp));
    if (!own.length) continue;
    const b = boxOf(own);
    if (inside(b)) {
      if (fillOf({ props: [{ matchName: 'ADBE Root Vectors Group', children: [g] }] }) !== '#FFFFFF') throw new Error(`QR group ${g.name}: not white`);
      modules.push(...own);
    } else if (b.x0 > sq.x1) caption.push(...own);
    else throw new Error(`QR group ${g.name} crosses the square`);
  }
  // the caption's glyphs: two lines, each glyph by its middle against the middle of the caption
  const cb = boxOf(caption);
  const below = (sp) => { const b = boxOf([sp]); return (b.y0 + b.y1) / 2 > (cb.y0 + cb.y1) / 2; };
  const lines = [caption.filter((sp) => !below(sp)), caption.filter(below)];
  if (lines.some((l) => !l.length) || boxOf(lines[0]).y1 > boxOf(lines[1]).y0 + 5) throw new Error('the QR caption is not two lines');
  return { square: sq, modules, lines: lines.map(boxOf), fill: '#FFFFFF' };
}

// Everything at rest, FHD px of the pack: the cards, the title, the timer, the speaker block, the QR, the windows, the
// header and the logo's cube.
export function screenLayout({ screens, header, logo, timer, speaker, rack, metrics }) {
  const { visual, visualTimer, speaker: spk, speakerTimer } = screens;
  const all = [visual, visualTimer, spk, speakerTimer];
  // the portal's cards (BG_WebinarPortal draws them): the left card's left edge, the right card's left and right
  const portal = dumpLayer(visual, 'PORTAL');
  const pm = layerToCompAt(visual, portal, PACK_T);
  const maskX = (name) => portal.masks.find((m) => m.name === name).path.value?.vertices ?? portal.masks.find((m) => m.name === name).path.keys[0].value.vertices;
  const card = { x0: r6(Math.min(...maskX('Mask 1').map((p) => applyPoint(pm, p)[0]))) };
  const right = { x0: r6(Math.min(...maskX('Mask 2').map((p) => applyPoint(pm, p)[0]))), x1: r6(Math.max(...maskX('Mask 2').map((p) => applyPoint(pm, p)[0]))) };
  // the title: one text box in every screen, each paragraph's first line at the same origin
  const titles = all.map((d) => {
    const L = d.layers.find((l) => l.type === 'text' && docOf(l).fontSize === TITLE_STYLE);
    const row = inkOf(metrics, d, L);
    const o = applyPoint(layerToCompAt(d, L, PACK_T), [row.lines[0][0], row.lines[0][1]]);
    return { o, step: row.lines[1][1] - row.lines[0][1], doc: docOf(L) };
  });
  const title = {
    origin: same(titles.map((t) => t.o[0]), 'title origin'), first: same(titles.map((t) => t.o[1]), 'title baseline'),
    step: same(titles.map((t) => t.step), 'title step'), font: titles[0].doc.font, size: titles[0].doc.fontSize,
    tracking: titles[0].doc.tracking, fill: hex(titles[0].doc.fillColor),
  };
  // the label «начало через»: the speaker's 35 px (the visual screen has 39.6), where the speaker's timer has it
  const labelL = dumpLayer(speakerTimer, 'начало через');
  const lrow = inkOf(metrics, speakerTimer, labelL);
  const lo = applyPoint(layerToCompAt(speakerTimer, labelL, PACK_T), [lrow.lines[0][0], lrow.lines[0][1]]);
  const label = { origin: [r6(lo[0]), r6(lo[1])], font: docOf(labelL).font, size: docOf(labelL).fontSize, fill: hex(docOf(labelL).fillColor), text: docOf(labelL).text };
  // the countdown: «TIMER» of «Timer precomp», the precomp where both timer screens put it
  const T = timer.layers.find((l) => l.name === 'TIMER');
  const tOrigins = [visualTimer, speakerTimer].map((d) => applyPoint(multiply(layerToCompAt(d, dumpLayer(d, 'Timer precomp'), PACK_T), layerToCompAt(timer, T, PACK_T)), [0, 0]));
  const tdoc = docOf(T);
  const digits = { origin: [same(tOrigins.map((o) => o[0]), 'timer x'), same(tOrigins.map((o) => o[1]), 'timer baseline')], font: tdoc.font, size: tdoc.fontSize, fill: hex(tdoc.fillColor) };
  // the room of the countdown: as far as the pack's widest value with one digit of minutes reaches (its timer is
  // 5 minutes); the arrow strip of the visual timer screen starts beyond it
  const p0 = dumpLayer(visualTimer, 'Pattern0');
  const strip = r6(applyPoint(layerToCompAt(visualTimer, p0, PACK_T), [shapeBoxAt(rack, rack.layers[0], PACK_T).x0, 0])[0]);
  const room = metrics.timer.one.right;
  if (digits.origin[0] + room > strip) throw new Error(`the countdown's room ends at ${digits.origin[0] + room}, past the strip at ${strip}`);
  // the speaker block: the text (35 px, three lines) on three plates from the right card's edge
  const st = spk.layers.find((l) => l.type === 'text' && docOf(l).fillColor[0] > 0.9);
  const srow = inkOf(metrics, spk, st);
  const sm = layerToCompAt(spk, st, PACK_T);
  const bases = srow.lines.map((l) => applyPoint(sm, [l[0], l[1]]));
  const plates = spk.layers.filter((l) => l.type === 'shape' && fillOf(l) === '#222222').map((l) => shapeBoxAt(spk, l, PACK_T)).sort((a, b) => a.y0 - b.y0);
  if (plates.length !== 3 || bases.length !== 3) throw new Error(`the speaker block: ${plates.length} plates, ${bases.length} lines`);
  const sx = same(bases.map((b) => b[0]), 'speaker lines');
  const own = metrics.speakerLines.lines;
  const sdoc = docOf(st);
  const block = {
    origin: r6(sx), first: r6(bases[0][1]), step: r6(bases[1][1] - bases[0][1]),
    font: sdoc.font, size: sdoc.fontSize, tracking: sdoc.tracking, fill: hex(sdoc.fillColor),
    plate: {
      x0: same(plates.map((p) => p.x0), 'plates x0'), h: same(plates.map((p) => p.y1 - p.y0), 'plate height'),
      // the plate's top above its line's baseline, and its right end past the line's ink (the pack's by hand)
      above: mean(plates.map((p, i) => bases[i][1] - p.y0)), padR: mean(plates.map((p, i) => p.x1 - (sx + own[i].right))),
      fill: '#222222',
    },
    pack: plates.map((p) => ({ y0: r6(p.y0), x1: r6(p.x1) })),
  };
  if (Math.abs(block.step - sdoc.leading) > 0.01) throw new Error(`the speaker lines step ${block.step}, the leading ${sdoc.leading}`);
  // the QR and its caption (36 px, tracking 0: the probe fits the outlines)
  const qr = qrModel(visual);
  const caps = ['Канал Cloud.ru', 'в Telegram'].map((s) => probeOf(metrics, s, 36));
  const cap = qr.lines.map((b, i) => {
    const [l, t, w, h] = caps[i].rect;
    if (Math.abs(b.x1 - b.x0 - w) > 0.5 || Math.abs(b.y1 - b.y0 - h) > 0.5) throw new Error(`QR caption line ${i + 1}: ${b.x1 - b.x0} x ${b.y1 - b.y0} against ${w} x ${h}`);
    return { x: b.x0 - l, base: b.y1 - (t + h) };
  });
  const caption = { origin: mean(cap.map((c) => c.x)), bases: cap.map((c) => r6(c.base)), size: 36, font: caps[0].font, tracking: 0, fill: qr.fill, pack: caps.map((c) => c.text) };
  // the visual's window: the pack's matte rectangle and its stroke
  const vw = dumpLayer(visual, 'Shape Layer 1');
  const vb = shapeBoxAt(visual, vw, PACK_T);
  const stroke = find(layerProp(vw, 'ADBE Root Vectors Group'), 'ADBE Vector Stroke Width')[0].value / 2;
  const window = { x0: r6(vb.x0 - stroke), y0: r6(vb.y0 - stroke), x1: r6(vb.x1 + stroke), y1: r6(vb.y1 + stroke) };
  // the speaker's photo: the picture of the comp «Спикер» where the speaker screens put it
  const png = speaker.layers[0];
  const photos = [spk, speakerTimer].map((d) => {
    const m = multiply(layerToCompAt(d, dumpLayer(d, 'Спикер'), PACK_T), layerToCompAt(speaker, png, PACK_T));
    const a = applyPoint(m, [0, 0]);
    const b = applyPoint(m, [png.source.width, png.source.height]);
    return { x0: a[0], y0: a[1], x1: b[0], y1: b[1] };
  });
  const photo = { x0: same(photos.map((p) => p.x0), 'photo x0'), y0: same(photos.map((p) => p.y0), 'photo y0'), x1: same(photos.map((p) => p.x1), 'photo x1'), y1: same(photos.map((p) => p.y1), 'photo y1') };
  // the header: the logo block where every screen puts it, the cube of its logo in the frame
  const hm = all.map((d) => layerToCompAt(d, dumpLayer(d, HEADER.name), PACK_T));
  const at = [same(hm.map((m) => applyPoint(m, [960, 540])[0]), 'header x'), same(hm.map((m) => applyPoint(m, [960, 540])[1]), 'header y')];
  const cubeL = logo.layers.find((l) => fillOf(l) === '#26D07C');
  const cb = shapeBoxAt(logo, cubeL, PACK_T);
  const lm = multiply(hm[0], layerToCompAt(header, dumpLayer(header, 'Logo'), PACK_T));
  const ca = applyPoint(lm, [cb.x0, cb.y0]);
  const cz = applyPoint(lm, [cb.x1, cb.y1]);
  return {
    W: visual.comp.width, H: visual.comp.height,
    card, right, title, label, digits, strip, room, block, qr, caption, window, photo,
    header: { at, descriptor: docOf(dumpLayer(header, 'облачные  и ИИ-сервисы')).font },
    logo: { cube: { x0: r6(ca[0]), y0: r6(ca[1]), w: r6(cz[0] - ca[0]) } },
  };
}

// The pack's texts by screen for the comparison (compare.mjs "pack:<key>"): the titles as their lines (the speaker's
// box wraps it after the words the metrics count), the speaker's lines, the caption. A real name stays in the dumps.
export function packTexts({ screens, metrics }, L) {
  const lines = (d) => {
    const t = d.layers.find((l) => l.type === 'text' && docOf(l).fontSize === TITLE_STYLE);
    const text = docOf(t).text;
    if (text.includes('\r')) return text.split('\r');
    const words = text.split(' ');
    const counts = metrics.titleWords[d.comp.name];
    if (!counts || counts.reduce((s, n) => s + n, 0) !== words.length) throw new Error(`${d.comp.name}: no word counts of its title lines`);
    let i = 0;
    return counts.map((n) => { const w = words.slice(i, i + n).join(' '); i += n; return w; });
  };
  const fill = (keys, list) => Object.fromEntries(keys.map((k, i) => [k, list[i] || '']));
  const caption = fill(CAPTION, L.caption.pack);
  const st = screens.speaker.layers.find((l) => l.type === 'text' && docOf(l).fillColor[0] > 0.9);
  return {
    visual: { ...fill(TITLE, lines(screens.visual)), ...caption },
    speaker: { ...fill(TITLE, lines(screens.speaker)), ...fill(SPEAKER, docOf(st).text.split('\r')), ...caption },
  };
}

// The QR placeholder: the pack's modules in a QR_SLOT square (one compound path, one fill).
export function qrPlaceholder(qr) {
  const s = QR_SLOT / (qr.square.x1 - qr.square.x0);
  const map = (p) => [r6((p[0] - qr.square.x0) * s), r6((p[1] - qr.square.y0) * s)];
  const scaleT = (p) => [r6(p[0] * s), r6(p[1] * s)];
  return qr.modules.map((sp) => ({ closed: sp.closed, vertices: sp.vertices.map(map), inTangents: sp.inTangents.map(scaleT), outTangents: sp.outTangents.map(scaleT) }));
}

// A neutral silhouette for the photo slot (D21: no real person in the template): a head and shoulders in the light
// grey, bottom-centred in the picture's frame as the pack's speaker stands.
const K = 0.5523;
export function ellipsePath(cx, cy, rx, ry) {
  return {
    closed: true,
    vertices: [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]].map((p) => p.map(r6)),
    inTangents: [[-K * rx, 0], [0, -K * ry], [K * rx, 0], [0, K * ry]].map((p) => p.map(r6)),
    outTangents: [[K * rx, 0], [0, K * ry], [-K * rx, 0], [0, -K * ry]].map((p) => p.map(r6)),
  };
}
export function shouldersPath(x0, y0, x1, y1, r) {
  return {
    closed: true,
    vertices: [[x0, y1], [x0, y0 + r], [x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1]].map((p) => p.map(r6)),
    inTangents: [[0, 0], [0, 0], [-K * r, 0], [0, 0], [0, -K * r], [0, 0]].map((p) => p.map(r6)),
    outTangents: [[0, 0], [0, -K * r], [0, 0], [K * r, 0], [0, 0], [0, 0]].map((p) => p.map(r6)),
  };
}
export function silhouette(w, h) {
  return [ellipsePath(w / 2, h * 0.27, w * 0.16, h * 0.19), shouldersPath(w * 0.12, h * 0.55, w * 0.88, h, w * 0.3)];
}

const square = (w, h) => [{ closed: true, vertices: [[0, 0], [w, 0], [w, h], [0, h]], inTangents: [[0, 0], [0, 0], [0, 0], [0, 0]], outTangents: [[0, 0], [0, 0], [0, 0], [0, 0]] }];

export function resolveScreen(sources = loadSources()) {
  const { svg, tokens, metrics } = sources;
  const base = tokens.color.base;
  const L = screenLayout(sources);
  // D1: the pack's dark texts and plates are the brand black, its light texts the brand white
  const colors = { dark: base.black.hex, light: base.white.hex, card: base.gray.hex, green: base.green.hex };
  for (const [got, want, what] of [[L.title.fill, colors.dark, 'title'], [L.label.fill, colors.dark, '«начало через»'], [L.digits.fill, colors.dark, 'timer'],
    [L.block.fill, colors.light, 'speaker text'], [L.block.plate.fill, colors.dark, 'plates'], [L.caption.fill, colors.light, 'QR caption']]) {
    if (got !== want) throw new Error(`webinar screens: ${what} ${got}, the brand has ${want}`);
  }
  const duration = { introSec: 0, holdSec: HOLD_SEC, outroSec: OUTRO_SEC, maxSec: MAX_SEC };
  const titleStyle = { font: L.title.font, size: L.title.size, fill: colors.dark, tracking: L.title.tracking, justify: 'LEFT' };
  const spkStyle = { font: L.block.font, size: L.block.size, fill: colors.light, tracking: L.block.tracking, justify: 'LEFT' };
  const capStyle = { font: L.caption.font, size: L.caption.size, fill: colors.light, tracking: 0, justify: 'LEFT' };
  // D21: neutral words in the template; the caption is the brand's channel (D7)
  const text = {
    TXT_TITLE1: { value: 'Название вебинара', label: 'Заголовок, строка 1', style: titleStyle },
    TXT_TITLE2: { value: 'в несколько строк', label: 'Заголовок, строка 2', style: titleStyle },
    TXT_TITLE3: { value: '', label: 'Заголовок, строка 3', style: titleStyle },
    TXT_SPK1: { value: 'Имя Фамилия', label: 'Спикер, строка 1', style: spkStyle },
    TXT_SPK2: { value: 'Должность', label: 'Спикер, строка 2', style: spkStyle },
    TXT_SPK3: { value: '', label: 'Спикер, строка 3', style: spkStyle },
    TXT_QR1: { value: L.caption.pack[0], label: 'Подпись QR, строка 1', style: capStyle },
    TXT_QR2: { value: L.caption.pack[1], label: 'Подпись QR, строка 2', style: capStyle },
  };
  const ctrl = {
    Layout: { label: 'Раскладка', items: LAYOUTS, value: 1 },
    Timer: { label: 'Таймер', kind: 'checkbox', value: 0 },
    Minutes: { label: 'Минуты', kind: 'slider', value: MINUTES.value },
  };
  const slots = { SLOT_VISUAL: { label: 'Визуал' }, SLOT_PHOTO: { label: 'Фото спикера' }, SLOT_QR: { label: 'QR-код' } };

  // the room of the title: to the visual's window less the margin the title keeps from the card's left edge
  const margin = r6(L.title.origin - L.card.x0);
  const titleRoom = r6(L.window.x0 - margin - L.title.origin);
  // the countdown shrinks with two digits of minutes to the room of one; «Начинаем» fits the same room
  const twoDigits = r6(L.room / metrics.timer.two.right);
  const go = probeOf(metrics, 'Начинаем', L.digits.size);
  const goFit = r6(Math.min(1, L.room / (go.rect[0] + go.rect[2])));
  // the speaker block: plates from the right card's edge, as far as its right edge less the same margin
  const B = L.block;
  const padL = r6(B.origin - B.plate.x0);
  const spkRoom = r6(L.right.x1 - margin - B.plate.x0);

  const pre = [
    'var C = thisComp.layer("CTRL");',
    'var k = Math.min(thisComp.width, thisComp.height) / 1080;',
    'var LAY = C.effect("Layout")(1).value, TIM = C.effect("Timer")(1).value;',
    `var MIN = Math.max(${MINUTES.min}, Math.min(${MINUTES.max}, Math.round(C.effect("Minutes")(1).value))), T0 = MIN * 60;`,
  ].join('\n') + '\n';
  const only = (lay) => pre + `LAY == ${lay} ? 100 : 0`;
  const inkJs = `function ink(n) { if (!hasText(n)) { return null; } var r = thisComp.layer(n).sourceRectAtTime(${REST}, false); return r.width > 0 ? { l: r.left / k, r: (r.left + r.width) / k } : null; }`;
  // lines of a block: empty ones collapse; f shrinks the block to its room
  const blockJs = (names, room, extra = 0) => pre + [
    `var N = ${js(names)};`,
    HAS_TEXT_JS,
    inkJs,
    'var at = [], right = [], n = 0, m = 0;',
    'for (var i = 0; i < N.length; i++) { var e = ink(N[i]); at.push(e ? n : -1); right.push(e ? e.r : 0); if (e) { n++; m = Math.max(m, e.r); } }',
    `var f = m + ${extra} > ${room} ? ${room} / (m + ${extra}) : 1;`,
  ].join('\n') + '\n';

  const spec = new Spec({ name: COMP, w: L.W, h: L.H, fps: FPS, duration: MAX_SEC });
  // bottom first: the visual, the photo, the QR and its caption, the timer, the title, the header and the logo, the
  // speaker's plates and lines on top (as the pack's layers lie)
  const vw = { w: r6(L.window.x1 - L.window.x0), h: r6(L.window.y1 - L.window.y0) };
  const vph = { name: `${COMP}_visual`, w: Math.round(vw.w * OVERSAMPLE), h: Math.round(vw.h * OVERSAMPLE) };
  vph.layers = [shape('Card', [pathGroup('Card', colors.card, square(vph.w, vph.h))])];
  spec.add(slot('SLOT_VISUAL', vph));
  spec.expr('SLOT_VISUAL', P.pos, pre + `[${r6((L.window.x0 + L.window.x1) / 2)} * k, ${r6((L.window.y0 + L.window.y1) / 2)} * k]`);
  spec.expr('SLOT_VISUAL', P.scale, pre + `var s = 100 * k * ${vw.w} / ${vph.w};\n[s, s]`);
  spec.expr('SLOT_VISUAL', P.opacity, only(1));
  const pw = { w: r6(L.photo.x1 - L.photo.x0), h: r6(L.photo.y1 - L.photo.y0) };
  const pph = { name: `${COMP}_photo`, w: Math.round(pw.w * OVERSAMPLE), h: Math.round(pw.h * OVERSAMPLE) };
  pph.layers = [shape('Silhouette', [pathGroup('Silhouette', colors.card, silhouette(pph.w, pph.h))])];
  spec.add(slot('SLOT_PHOTO', pph));
  spec.expr('SLOT_PHOTO', P.pos, pre + `[${r6((L.photo.x0 + L.photo.x1) / 2)} * k, ${r6((L.photo.y0 + L.photo.y1) / 2)} * k]`);
  spec.expr('SLOT_PHOTO', P.scale, pre + `var s = 100 * k * ${pw.w} / ${pph.w};\n[s, s]`);
  spec.expr('SLOT_PHOTO', P.opacity, only(2));
  const qs = L.qr.square;
  const qph = { name: `${COMP}_qr`, w: QR_SLOT, h: QR_SLOT, layers: [shape('QR', [pathGroup('Modules', L.qr.fill, qrPlaceholder(L.qr))])] };
  spec.add(slot('SLOT_QR', qph));
  spec.expr('SLOT_QR', P.pos, pre + `[${r6((qs.x0 + qs.x1) / 2)} * k, ${r6((qs.y0 + qs.y1) / 2)} * k]`);
  spec.expr('SLOT_QR', P.scale, pre + `var s = 100 * k * ${r6(qs.x1 - qs.x0)} / ${QR_SLOT};\n[s, s]`);
  CAPTION.forEach((t, i) => {
    spec.add(textLayer(t, { ...capStyle, value: text[t].value }, []));
    spec.expr(t, P.pos, pre + `[${L.caption.origin} * k, ${L.caption.bases[i]} * k]`);
  });
  // the timer: «начало через» and the countdown until the minutes are over, then «Начинаем» (D8)
  spec.add(textLayer('TXT_STARTS', { font: L.label.font, size: L.label.size, fill: colors.dark, tracking: 0, justify: 'LEFT', value: L.label.text }, []));
  spec.expr('TXT_STARTS', P.pos, pre + `[${L.label.origin[0]} * k, ${L.label.origin[1]} * k]`);
  spec.expr('TXT_STARTS', P.opacity, pre + 'TIM == 1 && time < T0 ? 100 : 0');
  const digitStyle = { font: L.digits.font, size: L.digits.size, fill: colors.dark, tracking: 0, justify: 'LEFT' };
  spec.add(textLayer('TXT_TIMER', { ...digitStyle, value: `${MINUTES.value}:00` }, []));
  spec.expr('TXT_TIMER', P.text, pre + 'var r = Math.max(0, T0 - time), s = Math.ceil(r - 1e-6), m = Math.floor(s / 60), ss = s % 60;\nm + ":" + (ss < 10 ? "0" : "") + ss');
  spec.expr('TXT_TIMER', P.pos, pre + `[${L.digits.origin[0]} * k, ${L.digits.origin[1]} * k]`);
  spec.expr('TXT_TIMER', P.scale, pre + `var f = MIN >= 10 ? ${twoDigits} : 1;\n[100 * f, 100 * f]`);
  spec.expr('TXT_TIMER', P.opacity, pre + 'TIM == 1 && time < T0 ? 100 : 0');
  spec.add(textLayer('TXT_GO', { ...digitStyle, value: 'Начинаем' }, []));
  spec.expr('TXT_GO', P.pos, pre + `[${L.digits.origin[0]} * k, ${L.digits.origin[1]} * k]`);
  spec.expr('TXT_GO', P.scale, `[${r6(100 * goFit)}, ${r6(100 * goFit)}]`);
  spec.expr('TXT_GO', P.opacity, pre + 'TIM == 1 && time >= T0 ? 100 : 0');
  // the title: up to three lines from the pack's first baseline, shrunk to the room
  const titleJs = (i) => blockJs(TITLE, titleRoom) + `var me = at[${i}], b = (${L.title.first} + Math.max(0, me) * ${L.title.step} * f) * k;\n`;
  for (let i = TITLE.length - 1; i >= 0; i -= 1) spec.add(textLayer(TITLE[i], { ...titleStyle, value: text[TITLE[i]].value }, []));
  TITLE.forEach((t, i) => {
    spec.expr(t, P.pos, titleJs(i) + `[${L.title.origin} * k, b]`);
    spec.expr(t, P.scale, titleJs(i) + '[100 * f, 100 * f]');
  });
  // the header: the pack's logo block (its hatching drifting in a seamless cycle, the descriptor) and the master logo
  spec.add(precomp('DECOR_HEADER', 'DECOR_HEADER', { collapse: true }));
  spec.expr('DECOR_HEADER', P.pos, pre + `[${L.header.at[0]} * k, ${L.header.at[1]} * k]`);
  spec.expr('DECOR_HEADER', P.scale, pre + '[100 * k, 100 * k]');
  const lockup = masterLockup(svg, fitCube(svg, L.logo.cube));
  spec.add(shape('LOGO', [pathGroup('Wordmark', colors.light, lockup.wordmark), pathGroup('Cube', colors.green, lockup.cube)]));
  spec.expr('LOGO', P.scale, 'var k = Math.min(thisComp.width, thisComp.height) / 1080;\n[100 * k, 100 * k]');
  // the speaker: each line on its plate from the right card's edge, the plates' right ends past the ink
  const spkJs = (i) => blockJs(SPEAKER, spkRoom, r6(padL + B.plate.padR)) + [
    `var me = at[${i}], s = Math.max(0, me), top = ${r6(B.first - B.plate.above)} + s * ${B.step} * f;`,
    `var w = me < 0 ? 0 : (${padL} + right[${i}] + ${B.plate.padR}) * f;`,
  ].join('\n') + '\n';
  SPEAKER.forEach((t, i) => spec.add(shape(`PL_SPK${i + 1}`, [{ name: 'Plate', rect: true, fill: colors.dark }])));
  for (let i = SPEAKER.length - 1; i >= 0; i -= 1) spec.add(textLayer(SPEAKER[i], { ...spkStyle, value: text[SPEAKER[i]].value }, []));
  SPEAKER.forEach((t, i) => {
    const pl = `PL_SPK${i + 1}`;
    spec.expr(pl, P.rectSize('Plate'), spkJs(i) + `[w * k, me < 0 ? 0 : ${B.plate.h} * f * k]`);
    spec.expr(pl, P.rectPos('Plate'), spkJs(i) + `[(${B.plate.x0} + w / 2) * k, (top + ${B.plate.h} * f / 2) * k]`);
    spec.expr(pl, P.opacity, only(2));
    spec.expr(t, P.pos, spkJs(i) + `[(${B.plate.x0} + ${padL} * f) * k, (top + ${B.plate.above} * f) * k]`);
    spec.expr(t, P.scale, spkJs(i) + '[100 * f, 100 * f]');
    spec.expr(t, P.opacity, only(2));
  });
  addQaPatch(spec, colors.green);
  spec.add(nul('CTRL', [
    { kind: 'dropdown', name: 'Layout', items: LAYOUTS, value: 1 },
    { kind: 'checkbox', name: 'Timer', value: false },
    { kind: 'slider', name: 'Minutes', value: MINUTES.value },
    { kind: 'checkbox', name: 'QA', value: false },
  ]));

  // AE lists the newest controller first: added in reverse of the panel's order
  const order = [{ effect: 'Layout' }, { effect: 'Timer', matchName: 'ADBE Checkbox Control' }, { effect: 'Minutes', matchName: 'ADBE Slider Control' },
    ...TITLE.map((t) => ({ text: t })), { slot: 'SLOT_VISUAL' }, { slot: 'SLOT_PHOTO' }, ...SPEAKER.map((t) => ({ text: t })),
    { slot: 'SLOT_QR' }, ...CAPTION.map((t) => ({ text: t }))];
  const egp = [...order].reverse();
  const label = (e) => (e.text ? text[e.text].label : e.slot ? slots[e.slot].label : ctrl[e.effect].label);
  const built = spec.toJSON();
  const header = sources.header;
  return {
    id: ID,
    workDir: workDir(),
    out: { dir: workPath('build', ID), aep: workPath('build', ID, ID + '_work.aep') },
    comp: spec.comp,
    colors,
    layout: L,
    fit: { margin, titleRoom, twoDigits, goFit, padL, spkRoom },
    text,
    slots,
    packs: packTexts(sources, L),
    ctrl,
    egp,
    rig: {},
    markers: [],
    duration,
    spec: {
      ...built,
      fonts: [...new Set([L.title.font, L.header.descriptor])],
      markers: [],
      transplant: {
        aep: packProject('webinars'),
        folder: 'BK_DECOR',
        source: HEADER,
        // the logo block as it is; its logo layer stays for the descriptor and the hatching that ride on it, without
        // its picture (the master logo replaces it); the hatching's drift in a cycle of whole lines
        comps: [{
          name: 'DECOR_HEADER',
          keep: header.layers.map((l) => ({ index: l.index, name: l.name })),
          hide: ['Logo'],
          duration: MAX_SEC,
          extendLayers: true,
          set: [{ layer: HATCH, path: ['group', 'Shape 1', 'Repeater 1', 'ADBE Vector Repeater Offset'], expr: `-100 + (time % ${HATCH_CYCLE}) * 0.5` }],
        }],
      },
      egp: egp.map((e) => (e.text ? { text: e.text, label: label(e) } : e.slot ? { slot: e.slot, label: label(e) }
        : { effect: e.effect, matchName: e.matchName || 'ADBE Dropdown Control', label: label(e) })),
      egpNames: order.map(label),
      measure: [
        { name: 'speaker', t: REST, ctrl: { Layout: 2, Timer: 1 }, text: {}, layers: [...TITLE, ...SPEAKER, 'PL_SPK1', 'PL_SPK2', 'TXT_STARTS', 'TXT_TIMER', ...CAPTION, 'LOGO'] },
        { name: 'go', t: MINUTES.value * 60, ctrl: { Layout: 1, Timer: 1 }, text: {}, layers: ['TXT_GO'] },
      ],
      defaults: { text: Object.fromEntries(Object.keys(text).map((t) => [t, text[t].value])), ctrl: { Layout: 1, Timer: 0, Minutes: MINUTES.value } },
    },
    check: {},
    version: 1,
    variants: ['16x9', '16x9_4K'].map((key) => ({ key, ...tokens.video.formats[key] })),
    sweepTimes: [0, 0.96, 5, 59.96, 299.96, 300, 304.96, 599.96, 904.96],
    rest: REST,
  };
}

export const resolve = resolveScreen;

// The library entry (library.src.json): a trim template; «Минуты» set the length when «Таймер» is on (C25); the
// portal's loop goes under it, picked by «Раскладка» and «Таймер».
export function libraryEntry(p = resolveScreen()) {
  const keys = { Layout: 'layout', Timer: 'timer', Minutes: 'minutes', SLOT_VISUAL: 'visual', SLOT_PHOTO: 'photo', SLOT_QR: 'qr',
    TXT_TITLE1: 'title1', TXT_TITLE2: 'title2', TXT_TITLE3: 'title3', TXT_SPK1: 'speaker1', TXT_SPK2: 'speaker2', TXT_SPK3: 'speaker3', TXT_QR1: 'qr1', TXT_QR2: 'qr2' };
  const accepts = { SLOT_VISUAL: ['photo', 'video'], SLOT_PHOTO: ['photo'], SLOT_QR: ['qr'] };
  const order = [...p.egp].reverse();
  const fields = order.map((e, i) => {
    const base = { key: keys[e.effect || e.slot || e.text] };
    if (e.effect === 'Layout') return { ...base, label_ru: p.ctrl.Layout.label, type: 'dropdown', egpName: p.ctrl.Layout.label, egpIndex: i, default: p.ctrl.Layout.value, options: p.ctrl.Layout.items.map((label, j) => ({ index: j + 1, label_ru: label })) };
    if (e.effect === 'Timer') return { ...base, label_ru: p.ctrl.Timer.label, type: 'checkbox', egpName: p.ctrl.Timer.label, egpIndex: i, default: Boolean(p.ctrl.Timer.value) };
    if (e.effect === 'Minutes') {
      return { ...base, label_ru: 'Минуты до начала', type: 'slider', egpName: p.ctrl.Minutes.label, egpIndex: i, min: MINUTES.min, max: MINUTES.max, default: MINUTES.value, drivesDuration: true, unitSec: 60, enabledBy: 'timer' };
    }
    if (e.slot) return { ...base, label_ru: p.slots[e.slot].label, type: 'media', egpName: p.slots[e.slot].label, egpIndex: i, accepts: accepts[e.slot] };
    return { ...base, label_ru: p.text[e.text].label, type: 'text', egpName: p.text[e.text].label, egpIndex: i, maxLen: CAPTION.includes(e.text) ? 30 : 40, default: p.text[e.text].value };
  });
  return {
    id: ID,
    title_ru: 'Экран вебинара',
    category: 'webinars',
    tier: 'T1',
    hosts: ['ae', 'pr'],
    version: p.version,
    fit: 'trim',
    duration: p.duration,
    requiredFonts: p.spec.fonts.map((f) => ({ postScriptName: f })),
    fields,
    variants: p.variants.map((v) => ({ key: v.key, aspect: '16x9', w: v.w, h: v.h, fps: FPS, aeComp: `${COMP}_${v.key}`, minHostVersion: { ae: '26.0', pr: '26.0' } })),
    companions: [{ ref: 'BG_WebinarPortal', kind: 'video', placement: 'under', default: true }],
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveScreen();
  const { qr, ...rest } = r.layout;
  console.log(JSON.stringify({ layers: r.spec.order, expressions: r.spec.expressions.length, layout: { ...rest, qr: { square: qr.square, modules: qr.modules.length, lines: qr.lines } },
    fit: r.fit, duration: r.duration, egp: r.spec.egpNames, transplant: r.spec.transplant.comps[0].keep, packs: Object.keys(r.packs) }, null, 1).slice(0, 8000));
}
