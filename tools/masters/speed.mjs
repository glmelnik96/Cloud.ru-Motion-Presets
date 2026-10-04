// Animation speed of a master (user requirement 2026-10-05: the panel changes duration and speed). A
// dropdown «Скорость» on CTRL picks a factor; every animated value is read at the mapped time T(t):
// the intro plays at speed s from 0, the outro at speed s up to the end, the hold between them shows the
// state at the end of the intro (the hold is static in every master). The protected regions cover the
// slowest speed, so in Premiere (responsive time) and in an AE instance (time remap, C27) the intro and
// the outro always play at their own speed whatever the clip length.
export const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
export const SPEED_ITEMS = ['0,75×', '1×', '1,25×', '1,5×', '2×'];
export const SPEED_CTRL = { label: 'Скорость', items: SPEED_ITEMS, value: SPEEDS.indexOf(1) + 1 };

const r6 = (v) => Math.round(v * 1e6) / 1e6;

// Expression code that defines SPEED and T(t) for a master whose intro ends at I and outro starts at O
// (rig times, seconds). Valid in both expression engines (ES3 syntax).
export function timeMapJs({ introEnd: I, outroStart: O }) {
  return [
    `var SPEED = [${SPEEDS.join(', ')}][thisComp.layer("CTRL").effect("Speed")(1).value - 1] || 1;`,
    'function T(t) {',
    '  var D = thisComp.duration;',
    `  if (t <= ${I} / SPEED) { return t * SPEED; }`,
    `  if (t >= D - (D - ${O}) / SPEED) { return D - (D - t) * SPEED; }`,
    `  return ${I};`,
    '}',
  ].join('\n') + '\n';
}

// Node twin of the expression, for tests and for picking review frames.
export function mapTime(t, { introEnd: I, outroStart: O, duration: D, speed: s }) {
  if (t <= I / s) return t * s;
  if (t >= D - (D - O) / s) return D - (D - t) * s;
  return I;
}

// Protected regions and library durations for the slowest speed, on the frame grid.
export function regions({ introEnd, outroStart, duration, fps }) {
  const slow = Math.min(...SPEEDS);
  const inEnd = Math.ceil(r6((introEnd / slow) * fps)) / fps;
  const outStart = Math.floor(r6((duration - (duration - outroStart) / slow) * fps)) / fps;
  if (!(inEnd < outStart)) {
    throw new Error(`speed: at ${slow}x the intro (to ${inEnd} s) runs into the outro (from ${outStart} s); lengthen the master`);
  }
  return {
    markers: [
      { comment: 'in', time: 0, duration: r6(inEnd) },
      { comment: 'out', time: r6(outStart), duration: r6(duration - outStart) },
    ],
    duration: { introSec: r6(inEnd), holdSec: r6(outStart - inEnd), outroSec: r6(duration - outStart) },
  };
}
