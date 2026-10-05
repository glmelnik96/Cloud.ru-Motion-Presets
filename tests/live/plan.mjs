// What the live checks insert (pure; tested in tests/panel/live-plan.test.mjs). Every variant of every
// catalog item gets two inserts with the same values: A at the template length D, B four seconds longer.
// Frames of A and B at the same template time must match: the intro and the outro keep their speed
// (Premiere: responsive time, S5; AE: time remap of contract C27).
import { initialValues } from '../../panel/src/core/fields.ts';
import { templateSec } from '../../panel/src/core/timing.ts';

const TEXT = ['Анна-Мария Ёлкина', 'Руководитель облачной платформы', 'Cloud.ru Evolution', 'Москва'];

// Values that differ from the defaults where the picture shows it; speed and size stay at their defaults
// so the frames of A and B stay comparable.
export function sampleValues(item) {
  const v = initialValues(item);
  let t = 0;
  for (const f of item.fields ?? []) {
    if (f.service || f.type === 'media' || f.key === 'speed' || f.key === 'size') continue;
    if (f.type === 'text') v[f.key] = TEXT[t++ % TEXT.length].slice(0, f.maxLen ?? 40);
    else if (f.type === 'dropdown') v[f.key] = f.options.length;
    else if (f.type === 'checkbox') v[f.key] = !v[f.key];
  }
  return v;
}

export const EXTRA_SEC = 4;

const onGrid = (t, fps) => Math.round(t * fps) / fps;

// Template times inside the intro and inside the outro, on the frame grid.
export function probeTimes(item, fps) {
  const d = item.duration;
  const D = templateSec(item);
  return { D, intro: onGrid(d.introSec / 2, fps), outro: onGrid(D - d.outroSec / 2, fps) };
}

// One case per variant of the host's T1 items: a comp or sequence of the variant's size.
export function variantCases(catalog, host) {
  const out = [];
  for (const item of catalog.items) {
    if (item.tier !== 'T1' || !item.hosts.includes(host)) continue;
    for (const v of item.variants) {
      out.push({ key: `${item.id}_${v.key}`, name: `LIVE_${item.id}_${v.key}`, id: item.id, variant: v.key, w: v.w, h: v.h, fps: v.fps ?? 25 });
    }
  }
  return out;
}

// Frames A/B for a case: [{ key, at (seconds from the comp or sequence start) }] and the pairs to compare.
export function framePlan(item, fps, startA, startB) {
  const p = probeTimes(item, fps);
  return {
    frames: [
      { key: 'a_intro', at: startA + p.intro },
      { key: 'b_intro', at: startB + p.intro },
      { key: 'a_outro', at: startA + p.outro },
      { key: 'b_outro', at: startB + p.outro + EXTRA_SEC },
    ],
    pairs: [['a_intro', 'b_intro'], ['a_outro', 'b_outro']],
  };
}

// Extra comps and sequences beside the variant cases.
export const EXTRA_TARGETS = [
  { key: 'nearest', name: 'LIVE_nearest_2560x1440', w: 2560, h: 1440, fps: 25 },
  { key: 'tracks', name: 'LIVE_tracks', w: 1920, h: 1080, fps: 25 },
  { key: 'undo', name: 'LIVE_undo', w: 1920, h: 1080, fps: 25 },
  { key: 'other', name: 'LIVE_other', w: 1920, h: 1080, fps: 25 },
];
