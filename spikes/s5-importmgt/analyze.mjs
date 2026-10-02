// S5 analysis (pure, unit-tested in tests/spikes/s5-analyze.test.mjs): where the stages put the clips,
// which frames are exported, and what the frames and the insert series say. The LowerThird and Hatch
// models come from S3 (part C, spikes/s3-instance/analyze.mjs), so AE and Premiere are measured at the
// same moments of the same templates.
import {
  FPS, LT, FRAMES, REGIONS, COLORS, TOL_PX, expectedLtX, describeLt, nearX, hatchX, frameTime, round,
} from '../s3-instance/analyze.mjs';
import { findColorCentroid, meanColor } from '../../tools/png/read-png.mjs';
import { deltaE2000Rgb, hexToRgb, rgbToHex } from '../../tools/color/deltae.mjs';
import { nodeCheck } from '../../tools/spike/multistage.mjs';

// Seconds on the work clone. Bars on V1 end at 30 s, so the clips on V3 from 40 s stand on black.
export const AT = { overwrite: 12, l1: 40, l2: 60, l3: 75, hatch: 90 };
export const RDT_SEC = 15; // explicit length of L1, the RDT LowerThird
export const HATCH_SEC = 12; // trimmed length of the Hatch, also written to its Duration slider
export const HATCH_DEFAULT_DURATION = 10; // CTRL Duration of CRT_Hatch_v1 in the fixture
export const SERIES = { startSec: 200, count: 50, minStepSec: 12, vIdx: 2 };

// Clip-local frames, taken from S3, where the LowerThird starts at LT.start and the Hatch at 0.
export const LOCAL = {
  intro: FRAMES.intro - LT.start * FPS, // 12 = 0.48 s
  outro: FRAMES.outro - LT.start * FPS, // 362 = 14.48 s of the 15 s clip
  hold: 125, // 5 s: plate, text and role at rest
  hatchHold: FRAMES.hatchHold, // 262 = 10.48 s
  hatchOut: FRAMES.hatchOut, // 287 = 11.48 s ("11.5 s" on the 25p grid)
};

// TXT_NAME (baseline 200, 800; 60 px) on PL_NAME (sourceRectAtTime + 40 px): the plate lies in this band.
export const NAME_BAND = { x: 0, y: 690, w: 1920, h: 190 };

const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true';

export function shotPlan(at = AT) {
  const f = (sec) => Math.round(sec * FPS);
  return [
    { key: 'l1Intro', frame: f(at.l1) + LOCAL.intro },
    { key: 'l1Outro', frame: f(at.l1) + LOCAL.outro },
    { key: 'l1Hold', frame: f(at.l1) + LOCAL.hold },
    { key: 'l2Hold', frame: f(at.l2) + LOCAL.hold },
    { key: 'l3Hold', frame: f(at.l3) + LOCAL.hold },
    { key: 'hatchHold', frame: f(at.hatch) + LOCAL.hatchHold },
    { key: 'hatchOut', frame: f(at.hatch) + LOCAL.hatchOut },
  ];
}

export function probeAt(img) {
  return img ? findColorCentroid(img, COLORS.probe, 10) : { x: null, y: null, count: 0, box: null };
}

const plate = (img, hex) => findColorCentroid(img, hex, 6, { region: NAME_BAND });
const whiteInRole = (img) => findColorCentroid(img, COLORS.white, 4, { region: REGIONS.role }).count;

// The template default of Style is its first item (Dark): read back as 0 or 1 it gives the index base.
export function indexBase(before) {
  const v = before && typeof before === 'object' && 'value' in before ? before.value : before;
  if (typeof v !== 'number' && !(typeof v === 'string' && /^\d+$/.test(v))) return 'unknown';
  if (Number(v) === 0) return 'zero-based';
  if (Number(v) === 1) return 'one-based';
  return 'unknown';
}

// img: { key: decoded 1920x1080 PNG } for the frames of shotPlan(); ins: data of stage "insert".
export function frameChecks(img, ins = {}) {
  const checks = [];
  const data = {};

  const intro = probeAt(img.l1Intro);
  data.intro = describeLt(FRAMES.intro, intro);
  checks.push(nodeCheck('RDT LowerThird made 15 s long: the intro keeps its speed (PROBE_SQ x~148 at 0.48 s)',
    nearX(intro, expectedLtX(FRAMES.intro, 'rdt')), data.intro));
  const outro = probeAt(img.l1Outro);
  data.outro = { ...describeLt(FRAMES.outro, outro), heldLastFrame: outro.count > 0 && Math.abs(outro.x - 300) <= TOL_PX };
  checks.push(nodeCheck('RDT LowerThird made 15 s long: the outro keeps its speed (PROBE_SQ x~248 at 14.48 s)',
    nearX(outro, expectedLtX(FRAMES.outro, 'rdt')), data.outro));

  for (const [key, frame] of [['hatchHold', FRAMES.hatchHold], ['hatchOut', FRAMES.hatchOut]]) {
    const m = probeAt(img[key]);
    const t = frameTime(frame);
    const d = {
      localFrame: frame, x: round(m.x), count: m.count,
      expected: round(hatchX(t, HATCH_SEC)), ifDurationIgnored: round(hatchX(t, HATCH_DEFAULT_DURATION)),
    };
    data[key] = d;
    checks.push(nodeCheck('Hatch trimmed to 12 s, Duration 12: PROBE_SQ x~' + d.expected + ' at ' + round(t) + ' s',
      nearX(m, hatchX(t, HATCH_SEC)), d));
  }

  if (img.l1Hold && img.l3Hold) {
    const w = plate(img.l1Hold, COLORS.plateDark);
    const d = plate(img.l3Hold, COLORS.plateDark);
    data.plates = { written: w.box, defaults: d.box };
    checks.push(nodeCheck('render: the written name widens the plate (L1 against L3)',
      Boolean(w.box && d.box) && w.box.w - d.box.w >= 250, data.plates));
    const sw = ins.writes && ins.writes.showRole;
    const hidden = !(sw && sw.written && truthy(sw.written.value));
    data.role = { written: whiteInRole(img.l1Hold), defaults: whiteInRole(img.l3Hold), expectHidden: hidden };
    checks.push(nodeCheck('render: the checkbox write ' + (hidden ? 'hides' : 'shows') + ' the role line',
      data.role.defaults >= 50 && (hidden ? data.role.written === 0 : data.role.written >= 50), data.role));
  } else {
    checks.push(nodeCheck('render: hold frames of L1 and L3 present', false, Object.keys(img)));
  }

  if (img.l2Hold && img.l3Hold) {
    const st = ins.style || {};
    const base = indexBase(st.before);
    data.dropdown = {
      base, readDefault: st.before === undefined ? null : st.before, written: st.written === undefined ? null : st.written,
      lightOnL2: plate(img.l2Hold, COLORS.plateLight).count, darkOnL3: plate(img.l3Hold, COLORS.plateDark).count,
    };
    checks.push(nodeCheck('render: the dropdown write turns the plate light; index base ' + base,
      data.dropdown.lightOnL2 >= 1000 && data.dropdown.darkOnL3 >= 1000 && base !== 'unknown', data.dropdown));
  } else {
    checks.push(nodeCheck('render: hold frames of L2 and L3 present', false, Object.keys(img)));
  }

  if (img.l3Hold) {
    const m = meanColor(img.l3Hold, REGIONS.patch);
    const de = deltaE2000Rgb(m, hexToRgb(COLORS.qa));
    data.patch = { mean: rgbToHex(m), alpha: round(m.a, 1), dE: round(de, 3) };
    checks.push(nodeCheck('colour patch in Premiere: dE2000 <= 2 against #26D07C', de <= 2, data.patch, false));
  }
  return { checks, data };
}

// Step between the series inserts: the default length plus 2 s, at least 12 s, so no insert overwrites
// the one before it.
export function seriesStep(defaultFrames) {
  const sec = defaultFrames > 0 ? defaultFrames / FPS : 10;
  return Math.max(SERIES.minStepSec, Math.ceil(sec) + 2);
}

export function seriesSummary(rows) {
  const total = rows.length;
  const landed = rows.filter((r) => r.found).length;
  const lengths = {};
  for (const r of rows) if (r.found) lengths[r.lenF] = (lengths[r.lenF] || 0) + 1;
  return {
    total,
    landed,
    dropped: total - landed,
    dropRate: total ? round((total - landed) / total, 3) : null,
    returnMismatch: rows.filter((r) => r.found !== r.returned).length,
    lengths,
    meanMs: total ? Math.round(rows.reduce((s, r) => s + (r.ms || 0), 0) / total) : null,
  };
}

export function seriesChecks(rows, params = {}) {
  const s = seriesSummary(rows);
  return {
    summary: s,
    note: s.total + ' importMGT, ' + s.dropped + ' not on the track within 2 s (' + round(100 * (s.dropRate || 0), 1)
      + ' %), lengths in frames ' + JSON.stringify(s.lengths) + ', step ' + params.stepSec + ' s, mean ' + s.meanMs + ' ms',
    checks: [
      nodeCheck('series: no silent drops', s.total > 0 && s.dropped === 0, { dropped: s.dropped, dropRate: s.dropRate }, false),
      nodeCheck('series: one default length', Object.keys(s.lengths).length === 1, s.lengths, false),
      nodeCheck('series: the return value of importMGT tells whether the clip landed', s.returnMismatch === 0, s.returnMismatch, false),
    ],
  };
}

// present: { startFrame: lengthInFrames } from stage "count", a new host call after the series.
export function recountChecks(rows, present) {
  const has = (r) => present[String(r.startF)] !== undefined;
  const late = rows.filter((r) => !r.found && has(r)).map((r) => r.i);
  const gone = rows.filter((r) => r.found && !has(r)).map((r) => r.i);
  const missing = rows.filter((r) => !has(r)).map((r) => r.i);
  return {
    late,
    note: 'recount: ' + (rows.length - missing.length) + ' of ' + rows.length + ' on the track, late ' + late.length + ', gone ' + gone.length,
    checks: [
      nodeCheck('recount: no clip appeared after the 2 s check (a blind retry would have doubled it)', late.length === 0, { late }, false),
      nodeCheck('recount: every clip seen during the series is still there', gone.length === 0, { gone }, false),
      nodeCheck('recount: the drops seen by a new host call recorded', true, { missing }, false),
    ],
  };
}
