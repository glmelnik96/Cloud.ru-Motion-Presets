// TTL_PlateSwap «Текст на плашке: смена фразы»: TTL_Plate's plates (both styles, all positions) with a second
// phrase, as the SMM pack's «Плашки» change theirs. Phrase 1 comes in and holds; from 4 s it leaves line by
// line, each plate takes the width of phrase 2 and phrase 2 rises; phrase 2 holds as long as the clip.
// A master of its own: the change must sit inside the protected intro (Premiere stretches only the hold), so
// its intro is 6.4 s (8.56 s at 0,75×) and the comp 12 s; TTL_Plate keeps 8 s for one phrase.
// Built by masters/TTL_Plate/resolve.mjs (buildPlate) from the same pack numbers; README for the choices.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlate, loadSources } from '../TTL_Plate/resolve.mjs';

export const ID = 'TTL_PlateSwap';
export const COMP = 'CR_TTL_PlateSwap';
const DURATION = 12;
// phrase 1 starts to leave: two lines of it hold about 2.5 s at 1×
const START = 4.0;
// a moment of the hold at every speed (0,75×: 8.56–9.04 s, 2×: 3.20–10.90 s): the ink of the lines is read there
const REST = 8.8;

export function resolveSwap(sources = loadSources()) {
  return buildPlate(sources, { id: ID, comp: COMP, duration: DURATION, rest: REST, swap: { start: START } });
}

export const resolve = resolveSwap;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = resolveSwap();
  console.log(JSON.stringify({ layers: r.spec.order, keys: r.spec.keys.length, expressions: r.spec.expressions.length, mattes: r.spec.mattes.length,
    egp: r.spec.egpNames, change: r.timing.change, introEnd: r.timing.introEnd, outroStart: r.timing.outroStart, markers: r.markers, duration: r.duration }, null, 1));
}
