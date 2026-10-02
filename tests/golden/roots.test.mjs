import { describe, it, expect } from 'vitest';
import { pickRoots, rootsFile } from '../../tools/golden/roots.mjs';

const comp = (id, name, usedIn = [], extra = {}) => ({
  id, name, usedIn, width: 3840, height: 2160, fps: 25, duration: 10, markers: [], ...extra,
});

describe('pickRoots', () => {
  it('keeps comps nobody uses as a layer source, with slugs unique over all comps', () => {
    const { roots, slugMap } = pickRoots([
      comp(304, 'Pattern_1', [691]),
      comp(691, 'Заставка_ПОДКАСТ_CLOUD.RU'),
      comp(796, 'Pattern_1'),
      comp(459, 'Подкаст'),
    ]);
    expect(roots.map((r) => [r.id, r.compSlug])).toEqual([[796, 'pattern_1_2'], [459, 'podkast'], [691, 'zastavka_podkast_cloud_ru']]);
    expect(roots[0].keyFrames).toBe(41);
    expect(slugMap.map((s) => [s.id, s.compSlug, s.root])).toEqual([
      [304, 'pattern_1', false], [459, 'podkast', true], [691, 'zastavka_podkast_cloud_ru', true], [796, 'pattern_1_2', true],
    ]);
  });
  it('writes roots.json under the ASCII work folder', () => {
    expect(rootsFile('podcast')).toMatch(/\/golden\/podcast\/roots\.json$/);
  });
});
