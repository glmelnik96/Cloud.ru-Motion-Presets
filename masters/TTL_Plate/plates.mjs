// The two styles of TTL_Plate «Текст на плашке», up to three lines with a plate each:
//   1 «Подкаст» — the podcast pack «Текст на плашке_1» (right) and «Булит» (centre): green plates, dark caps;
//   2 «SMM» — the SMM pack «Плашки_9x16» and «Плашки_1x1»: dark plates, lime text, from the left edge.
// Both run on the plate block of the rig (tools/masters/rig-plate.mjs, addPlateBlock): lines stack from the
// bottom, an empty line collapses, each plate grows from its outer edge and its text rises by words inside it.
// Curves are the signed motion canon (M1 plate, M2 text, brand/tokens.json), checked against the pack keys;
// delays between the lines come from the pack.
import { dumpKeys } from '../../tools/masters/dump-keys.mjs';
import { checkCanon, END, lineAt, START } from '../../tools/masters/rig-plate.mjs';

const FPS = 25;
const POD_REST = 4.0;          // «Текст на плашке_1», «Булит»: every line at rest 3.32–7.32 s
const T = ['ADBE Transform Group'];
export const SMM_9x16 = [['Разверните свой сервис 2', 'Shape Layer 7'], [' видеоконференций 2', 'Shape Layer 6']];
export const SMM_1x1 = { 1.6: [['Разверните свой личный', 'Shape Layer 3'], [' блог на Word Press', 'Shape Layer 4']],
  5: [['На виртуальной машине', 'Shape Layer 3'], [' Cloud.ru Evolution', 'Shape Layer 4']] };

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const mean = (list) => r6(list.reduce((s, v) => s + v, 0) / list.length);
const sameText = (list, label) => {
  if (list.some((v) => v !== list[0])) throw new Error(`${label}: the pack is no longer uniform: ${list.join(', ')}`);
  return list[0];
};
const same = (list, label, tol = 1e-6) => {
  if (list.some((v) => Math.abs(v - list[0]) > tol)) throw new Error(`${label}: the pack is no longer uniform: ${list.join(', ')}`);
  return r6(list[0]);
};

// «Подкаст»: right side from «Текст на плашке_1» (three lines), centre from «Булит» and «Булит_1» (two each).
// The pack's plates are scaled by hand around each text, so the paddings are the means; side «Слева» mirrors
// the right one. Булит's lower plate is 48 px tall (104.4 %): the master keeps one plate height.
export function podcastLayout({ pod, bulit, bulit1, metrics }) {
  const right = [1, 2, 3].map((i) => lineAt(pod, metrics, `Text_${i}`, `Box_${i}`, POD_REST));
  const center = [bulit, bulit1].flatMap((d) => [1, 2].map((i) => lineAt(d, metrics, `Text_${i}`, `Box_${i}`, POD_REST)));
  const all = right.concat(center);
  return {
    font: sameText(all.map((x) => x.font), 'podcast font'),
    size: same(all.map((x) => x.size), 'podcast size'),
    tracking: same(all.map((x) => x.tracking), 'podcast tracking'),
    rise: same(all.map((x) => x.rise), 'podcast rise'),
    h: same(right.map((x) => x.plate.h), 'podcast plate height', 0.01),
    step: mean([right[1].plate.y0 - right[0].plate.y0, right[2].plate.y0 - right[1].plate.y0]),
    base: mean(all.map((x) => x.plate.y1 - x.baseline)),
    pads: {
      outer: mean(right.map((x) => x.plate.x1 - x.ink.x1)),
      inner: mean(right.map((x) => x.ink.x0 - x.plate.x0)),
      center: mean(center.flatMap((x) => [x.ink.x0 - x.plate.x0, x.plate.x1 - x.ink.x1])),
    },
    edge: mean(right.map((x) => x.W - x.plate.x1)),
    bottom: { side: r6(right[2].H - right[2].plate.y1), center: mean([center[1], center[3]].map((x) => x.H - x.plate.y1)) },
  };
}

// «SMM»: vertical from «Плашки_9x16», square from «Плашки_1x1» (both phrases). The text stands at a fixed
// origin inside the plate (point text, left-justified) and the plate ends a pad after the ink; the mirrored
// side keeps the mean ink pad on the outer side.
export function smmLayout({ s916, s11, metrics }) {
  const v = SMM_9x16.map(([t, p]) => lineAt(s916, metrics, t, p, 3));
  const q = Object.entries(SMM_1x1).flatMap(([t, pairs]) => pairs.map(([n, p]) => lineAt(s11, metrics, n, p, Number(t))));
  const all = v.concat(q);
  return {
    font: sameText(all.map((x) => x.font), 'smm font'),
    size: same(all.map((x) => x.size), 'smm size'),
    tracking: same(all.map((x) => x.tracking), 'smm tracking'),
    rise: same(all.map((x) => x.rise), 'smm rise'),
    h: same(all.map((x) => x.plate.h), 'smm plate height', 0.01),
    step: same([v[1].plate.y0 - v[0].plate.y0, q[1].plate.y0 - q[0].plate.y0, q[3].plate.y0 - q[2].plate.y0], 'smm line step', 0.01),
    base: same(all.map((x) => r6(x.plate.y1 - x.baseline)), 'smm baseline', 0.01),
    origin: mean(all.map((x) => x.originX - x.plate.x0)),
    padR: mean(all.map((x) => x.plate.x1 - x.ink.x1)),
    padInk: mean(all.map((x) => x.ink.x0 - x.plate.x0)),
    // the square pack's plates start 0.85–1.1 px inside the frame: flush here (no video sliver at the edge)
    edge: { vertical: mean(v.map((x) => x.plate.x0)), horizontal: 0, squarePack: mean(q.map((x) => x.plate.x0)) },
    bottom: { vertical: r6(v[1].H - v[1].plate.y1), horizontal: mean([q[1], q[3]].map((x) => x.H - x.plate.y1)) },
  };
}

// The podcast timing of «Текст на плашке_1»: plates of lines 1–3 start 0 / 0.28 / 0.68 s apart, each text
// 0.52 s after its plate; on the way out the texts go 0.2 s apart from the top and each plate 0.28 s after
// its text. «Булит» starts its texts 0.12 s after the plates and its plates 0.04 s after the texts on the way
// out; the master keeps one timing (the item's name source).
export function podcastTiming(pod, canon) {
  const M1 = canon.M1.styles.podcast;
  const M2 = canon.M2.styles.podcast;
  const box = [1, 2, 3].map((i) => dumpKeys(pod, `Box_${i}`, ...T, 'ADBE Scale'));
  const txt = [1, 2, 3].map((i) => dumpKeys(pod, `Text_${i}`, ...START));
  box.forEach((k, i) => {
    checkCanon(k, 0, M1.in, { dim: 0, label: `podcast Box_${i + 1} in` });
    checkCanon(k, 2, M1.out, { dim: 0, label: `podcast Box_${i + 1} out` });
  });
  txt.forEach((k, i) => {
    checkCanon(k, 0, M2.in, { label: `podcast Text_${i + 1} in` });
    checkCanon(k, 2, M2.out, { label: `podcast Text_${i + 1} out` });
  });
  return {
    plateIn: M1.in, plateOut: M1.out, textIn: M2.in, textOut: M2.out,
    inDelays: box.map((k) => r6(k[0].time - box[0][0].time)),
    textLag: same(txt.map((k, i) => k[0].time - box[i][0].time), 'podcast text after plate'),
    outStagger: same([txt[1][2].time - txt[0][2].time, txt[2][2].time - txt[1][2].time], 'podcast out stagger'),
    plateLag: same(box.map((k, i) => k[2].time - txt[i][2].time), 'podcast plate after text'),
  };
}

// The SMM timing of «Плашки_9x16»: the bottom line first, the next one 0.4 s later (canon M1 stagger, 10
// frames); a text starts with its plate. Out: the text End by words, its plate 0.56 s later (the upper
// pair of the second phrase; the pack's lower pair of that phrase leaves in another order).
export function smmTiming(s916, s11, canon) {
  const M1 = canon.M1.styles.smm;
  const M2 = canon.M2.styles.smmPlates;
  const [top, bottom] = SMM_9x16;
  const plate = (n) => dumpKeys(s916, n, ...T, 'ADBE Scale');
  const pb = plate(bottom[1]);
  const pt = plate(top[1]);
  for (const [k, label] of [[pb, 'bottom'], [pt, 'top']]) {
    checkCanon(k, 0, M1.in, { dim: 0, label: `smm plate ${label} in` });
    checkCanon(k, 4, M1.out, { dim: 0, label: `smm plate ${label} out` });
  }
  const sb = dumpKeys(s916, bottom[0], ...START);
  const st = dumpKeys(s916, top[0], ...START);
  checkCanon(sb, 0, M2.in, { label: 'smm text bottom in' });
  checkCanon(st, 0, M2.in, { label: 'smm text top in' });
  const eb = dumpKeys(s916, bottom[0], ...END);
  const et = dumpKeys(s916, top[0], ...END);
  checkCanon(eb, 0, M2.out, { label: 'smm text bottom out' });
  checkCanon(et, 0, M2.out, { label: 'smm text top out' });
  const stagger = same([pt[0].time - pb[0].time, st[0].time - sb[0].time, et[0].time - eb[0].time], 'smm stagger');
  if (Math.abs(stagger * FPS - M1.stagger) > 1e-6) throw new Error(`smm stagger ${stagger} s, canon ${M1.stagger} frames`);
  const p2 = dumpKeys(s916, 'На виртуальной машине 2', ...END);
  const q2 = dumpKeys(s11, 'На виртуальной машине', ...END);
  const plateLag = same([pt[4].time - p2[0].time, dumpKeys(s11, 'Shape Layer 3', ...T, 'ADBE Scale')[4].time - q2[0].time], 'smm plate after text End');
  return {
    plateIn: M1.in, plateOut: M1.out, textIn: M2.in, textOut: M2.out,
    inDelays: [0, stagger, 2 * stagger],
    textLag: same([sb[0].time - pb[0].time, st[0].time - pt[0].time], 'smm text with plate'),
    outStagger: stagger,
    plateLag,
  };
}
