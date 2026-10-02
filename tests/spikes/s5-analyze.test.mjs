import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import {
  shotPlan, frameChecks, indexBase, seriesStep, seriesSummary, seriesChecks, recountChecks,
} from '../../spikes/s5-importmgt/analyze.mjs';

// Synthetic 1920x1080 frames on black, painted with the fixture geometry (part B contract).
function frame(rects) {
  const img = new PNG({ width: 1920, height: 1080 });
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  for (const [x0, y0, w, h, [r, g, b]] of rects) {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        const i = (y * 1920 + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      }
    }
  }
  return img;
}
const MAGENTA = [255, 0, 255];
const DARK = [34, 34, 34];
const LIGHT = [242, 242, 242];
const WHITE = [255, 255, 255];
const QA = [38, 208, 124];
const probe = (cx) => [cx - 20, 80, 40, 40, MAGENTA]; // PROBE_SQ 40x40 centred on (cx, 100)
const patch = [1770, 50, 100, 100, QA]; // QA_PATCH 100x100 centred on (1820, 100)
const role = [200, 845, 180, 25, WHITE]; // the role line under the plate

const good = () => ({
  l1Intro: frame([probe(148)]),
  l1Outro: frame([probe(248)]),
  l1Hold: frame([[160, 720, 1300, 130, DARK], patch]),
  l2Hold: frame([[160, 720, 480, 130, LIGHT], role, patch]),
  l3Hold: frame([[160, 720, 480, 130, DARK], role, patch]),
  hatchHold: frame([probe(100)]),
  hatchOut: frame([probe(148)]),
});
const INS = {
  writes: { showRole: { written: { type: 'boolean', value: false } } },
  style: { before: { type: 'number', value: 1 }, written: 2 },
};

describe('S5 frame plan', () => {
  it('takes the S3 moments relative to each clip start', () => {
    expect(shotPlan().map((s) => [s.key, s.frame])).toEqual([
      ['l1Intro', 1012], ['l1Outro', 1362], ['l1Hold', 1125], ['l2Hold', 1625],
      ['l3Hold', 2000], ['hatchHold', 2512], ['hatchOut', 2537],
    ]);
  });
});

describe('S5 frame checks', () => {
  it('passes when Premiere honours RDT, the trim, every write and the colour', () => {
    const r = frameChecks(good(), INS);
    expect(r.checks.filter((c) => !c.pass)).toEqual([]);
    expect(r.data.dropdown.base).toBe('one-based');
    expect(r.data.intro.explainedBy).toEqual(['rdt', 'none']);
  });

  it('names a uniform stretch, a held last frame and an ignored Duration', () => {
    const img = { ...good(), l1Outro: frame([probe(265)]), hatchOut: frame([probe(200)]) };
    const r = frameChecks(img, INS);
    const failed = r.checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed).toHaveLength(2);
    expect(r.data.outro.explainedBy).toEqual(['uniform']);
    expect(r.data.hatchOut).toMatchObject({ x: 200, expected: 148, ifDurationIgnored: 200 });
    const held = frameChecks({ ...good(), l1Outro: frame([probe(300)]) }, INS);
    expect(held.data.outro.heldLastFrame).toBe(true);
  });

  it('fails the render checks when a write did not reach the picture', () => {
    const img = { ...good(), l1Hold: frame([[160, 720, 480, 130, DARK], role]), l2Hold: frame([[160, 720, 480, 130, DARK]]) };
    const failed = frameChecks(img, INS).checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed).toEqual([
      'render: the written name widens the plate (L1 against L3)',
      'render: the checkbox write hides the role line',
      'render: the dropdown write turns the plate light; index base one-based',
    ]);
  });

  it('reads the index base from the default value', () => {
    expect(indexBase({ type: 'number', value: 0 })).toBe('zero-based');
    expect(indexBase(1)).toBe('one-based');
    expect(indexBase({ type: 'boolean', value: false })).toBe('unknown');
    expect(indexBase(null)).toBe('unknown');
  });
});

describe('S5 series', () => {
  const rows = [
    { i: 0, startF: 5000, found: true, returned: true, lenF: 250, ms: 400 },
    { i: 1, startF: 5300, found: false, returned: true, lenF: null, ms: 2100 },
    { i: 2, startF: 5600, found: true, returned: true, lenF: 250, ms: 300 },
  ];

  it('spaces the inserts by the default length', () => {
    expect(seriesStep(250)).toBe(12);
    expect(seriesStep(null)).toBe(12);
    expect(seriesStep(1500)).toBe(62);
  });

  it('counts drops, lengths and return-value mismatches', () => {
    expect(seriesSummary(rows)).toEqual({
      total: 3, landed: 2, dropped: 1, dropRate: 0.333, returnMismatch: 1, lengths: { 250: 2 }, meanMs: 933,
    });
    const r = seriesChecks(rows, { stepSec: 12 });
    expect(r.checks.map((c) => [c.pass, c.required])).toEqual([[false, false], [true, false], [false, false]]);
    expect(r.note).toContain('1 not on the track within 2 s (33.3 %)');
  });

  it('finds clips that arrived late and clips that vanished', () => {
    const r = recountChecks(rows, { 5300: 250, 5600: 250 });
    expect(r.late).toEqual([1]);
    expect(r.checks.map((c) => c.pass)).toEqual([false, false, true]);
    expect(r.note).toBe('recount: 2 of 3 on the track, late 1, gone 1');
  });
});
