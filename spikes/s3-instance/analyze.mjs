// S3 analysis: where PROBE_SQ must be under each duration-fitting model, the frame plan, and the
// duration-fit mechanism for contract rule C27 (recommendMechanism).
// Pure functions (no host, no files), unit-tested in tests/spikes/s3-analyze.test.mjs.

export const FPS = 25;
export const TOL_PX = 2.5;

// CRT_LowerThird_v1 (fixture contract, part B): 10 s, protected regions 0-1 s and 9-10 s.
// The user instance starts at 2 s and must last 15 s.
export const LT = { start: 2, compDur: 10, intro: 1, outro: 1, target: 15 };
// PROBE_SQ x keys, linear: 0 s 100, 1 s 200, 9 s 200, 10 s 300.
export const LT_KEYS = [[0, 100], [1, 200], [9, 200], [10, 300]];

// Whole frames sampled in the user comps (25 fps).
export const FRAMES = {
  hold: 200, // 8.00 s: middle of the instance, before and after the field writes
  intro: 62, // 2.48 s = 0.48 s into the instance
  outro: 412, // 16.48 s = 14.48 s into the instance, 0.52 s before its end at 17 s
  hatchHold: 262, // 10.48 s: Hatch instance with Duration 12, before its outro
  hatchOut: 287, // 11.48 s: inside the Hatch outro
};

// Measuring regions in 1920x1080 comp pixels (fixture positions; layer anchors at their centres).
export const REGIONS = {
  patch: { x: 1795, y: 75, w: 50, h: 50 }, // QA_PATCH 100x100 at (1820, 100)
  slot: { x: 1450, y: 490, w: 100, h: 100 }, // SLOT_PHOTO 400x400 at (1500, 540)
  role: { x: 190, y: 830, w: 360, h: 60 }, // TXT_ROLE, 40 px, baseline at (200, 870)
};

export const COLORS = {
  probe: '#FF00FF',
  qa: '#26D07C',
  slotA: '#0063FF',
  slotB: '#FF4517',
  plateDark: '#222222',
  plateLight: '#F2F2F2',
  white: '#FFFFFF',
};

// What the host may do to a stretched instance (explainX, describeLt).
export const MODELS = ['rdt', 'uniform', 'none'];
// A time-remapped instance: the keys took effect (remap) or time remap changed nothing (none).
export const REMAP_MODELS = ['remap', 'none'];

export const frameTime = (frame, fps = FPS) => frame / fps;

export const round = (v, digits = 2) => (v === null || v === undefined ? null : Number(v.toFixed(digits)));

// Piecewise-linear value of keys [[t, v], ...] at time t, held before the first and after the last key.
export function xAtTime(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return keys[keys.length - 1][1];
}

// Time-remap keys [layer time, template time] that make an unstretched instance layerDur seconds long:
// intro and outro at template speed, the middle stretched. For LT at 15 s: 0->0, 1->1, 14->9, 15->10.
export function remapKeys({ compDur, intro, outro, layerDur }) {
  return [[0, 0], [intro, intro], [layerDur - outro, compDur - outro], [layerDur, compDur]];
}

// Layer-local time -> time inside the template comp.
//   rdt     - protected intro and outro keep their speed, the middle absorbs the stretch;
//   remap   - linear time-remap keys (remapKeys) on an unstretched layer: the rdt mapping, held
//             outside the keys as AE holds a remapped layer;
//   uniform - a plain time stretch of the whole comp;
//   none    - no stretch (a trimmed or extended out point).
export function masterTime(local, model, { compDur, intro, outro, layerDur }) {
  if (model === 'none') return local;
  if (model === 'uniform') return (local * compDur) / layerDur;
  if (model === 'rdt') {
    if (local <= intro) return local;
    if (local >= layerDur - outro) return compDur - (layerDur - local);
    return intro + ((local - intro) * (compDur - intro - outro)) / (layerDur - intro - outro);
  }
  if (model === 'remap') return xAtTime(remapKeys({ compDur, intro, outro, layerDur }), local);
  throw new Error('unknown model: ' + model);
}

// Expected PROBE_SQ x in the user comp at `frame`, or null when the instance shows nothing there.
export function expectedLtX(frame, model, lt = LT) {
  const local = frameTime(frame) - lt.start;
  const layerDur = model === 'none' ? lt.compDur : lt.target;
  if (local < 0 || local >= layerDur) return null;
  return xAtTime(LT_KEYS, masterTime(local, model, { ...lt, layerDur }));
}

export function nearX(measured, expected, tol = TOL_PX) {
  return measured.count > 0 && expected !== null && Math.abs(measured.x - expected) <= tol;
}

// Models that explain a measured centroid ({x, count}); count 0 = PROBE_SQ is not in the frame.
export function explainX(frame, measured, tol = TOL_PX, models = MODELS) {
  return models.filter((m) => {
    const e = expectedLtX(frame, m);
    return e === null ? measured.count === 0 : nearX(measured, e, tol);
  });
}

// CRT_Hatch_v1 PROBE_SQ: x = 100 until d - 1, then linear to 200 at d (d = the Duration slider).
export function hatchX(t, d) {
  if (t < d - 1) return 100;
  return xAtTime([[d - 1, 100], [d, 200]], t);
}

// Detail for the record: measured x, expected x per model, models that explain it.
export function describeLt(frame, measured, models = MODELS) {
  const expected = {};
  for (const m of models) expected[m] = round(expectedLtX(frame, m));
  return { frame, x: round(measured.x), count: measured.count, expected, explainedBy: explainX(frame, measured, TOL_PX, models) };
}

// Duration-fit mechanism of an AE instance, from the S3 checks; plan 1 task 30 copies it into contract
// rule C27. rdt is preferred: the template's protected regions stay the single source of timing.
// A mechanism counts as measured once its frame checks exist ('RDT stretch: ', 'time remap: ').
//   rdt       - every 'RDT fit: ' and 'RDT stretch: ' check passed;
//   remap     - else every 'remap: ' and 'time remap: ' check passed;
//   trim-only - else (both measured): only trim templates fit, by a cut out point and Duration;
//   null      - the run stopped before the RDT frames, or before the time-remap frames after RDT failed.
export function recommendMechanism(checks) {
  const pick = (re) => checks.filter((c) => re.test(c.name));
  const failed = (list) => list.filter((c) => !c.pass).map((c) => c.name);
  const notMeasured = (what) => ({
    mechanism: null,
    mechanismReason: `not measured: the run stopped before the ${what} frames`,
  });
  const rdt = pick(/^RDT (fit|stretch): /);
  const remap = pick(/^(time )?remap: /);
  if (!rdt.some((c) => c.name.startsWith('RDT stretch: '))) return notMeasured('RDT');
  if (!failed(rdt).length) {
    return {
      mechanism: 'rdt',
      mechanismReason: 'a time stretch of the instance keeps the protected intro and outro at template speed',
    };
  }
  if (!remap.some((c) => c.name.startsWith('time remap: '))) return notMeasured('time-remap');
  if (!failed(remap).length) {
    return {
      mechanism: 'remap',
      mechanismReason: 'time-remap keys keep the intro and outro at template speed; RDT failed: ' + failed(rdt).join('; '),
    };
  }
  return {
    mechanism: 'trim-only',
    mechanismReason: 'neither RDT nor time remap keeps the intro and outro at template speed; failed: '
      + failed(rdt).concat(failed(remap)).join('; '),
  };
}
