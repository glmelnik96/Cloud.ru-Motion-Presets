import { describe, it, expect } from 'vitest';
import { chooseVariant, frameLabel, nearestVariant, templateName } from '../../../panel/src/core/variant';
import type { Item, Variant } from '../../../panel/src/core/types';
import { item, variant } from './fixture';

const frame = (w: number, h: number, fps = 25) => ({ w, h, fps });
const nearestKey = (it: Item, w: number, h: number) => chooseVariant(it, frame(w, h)).nearest?.key;

describe('chooseVariant: an exact frame is automatic (P1)', () => {
  it('picks the variant whose w x h equals the frame', () => {
    const shot = item('LOGO_Shot');
    expect(chooseVariant(shot, frame(1920, 1080))).toEqual({ variant: variant(shot, '16x9'), match: 'exact' });
    expect(chooseVariant(shot, frame(3840, 2160))).toEqual({ variant: variant(shot, '16x9_4K'), match: 'exact' });
    expect(chooseVariant(shot, frame(1080, 1920))).toEqual({ variant: variant(shot, '9x16'), match: 'exact' });
    const ttl = item('TTL_LowerThird');
    expect(chooseVariant(ttl, frame(1080, 1080))).toEqual({ variant: variant(ttl, '1x1'), match: 'exact' });
  });
  it('does not look at fps: a mismatch is only a warning (P2)', () => {
    expect(chooseVariant(item('LOGO_Mark'), frame(1920, 1080, 29.97))).toMatchObject({ match: 'exact', variant: { key: '16x9' } });
  });
  it('prefers the variant with the target fps when two share a frame', () => {
    const mark = item('LOGO_Mark');
    mark.variants.push({ ...variant(mark, '16x9'), key: '16x9_30', fps: 30, aeComp: 'CR_LOGO_Mark_16x9_30_v1' });
    expect(chooseVariant(mark, frame(1920, 1080, 30)).variant?.key).toBe('16x9_30');
    expect(chooseVariant(mark, frame(1920, 1080, 25)).variant?.key).toBe('16x9');
  });
  it('compares the fps of two variants of one frame at 3 decimals, rounded and not cut', () => {
    const mark = item('LOGO_Mark');
    mark.variants.push({ ...variant(mark, '16x9'), key: '16x9_30', fps: 30, aeComp: 'CR_LOGO_Mark_16x9_30_v1' });
    expect(chooseVariant(mark, frame(1920, 1080, 29.9996)).variant?.key).toBe('16x9_30');
    const odd = item('LOGO_Mark');
    odd.variants.push({ ...variant(odd, '16x9'), key: '16x9_30', fps: 29.9996, aeComp: 'CR_LOGO_Mark_16x9_30_v1' });
    expect(chooseVariant(odd, frame(1920, 1080, 30)).variant?.key).toBe('16x9_30');
    expect(chooseVariant(odd, frame(1920, 1080, 29.97)).variant?.key).toBe('16x9'); // no variant at that fps: the first
  });
});

describe('chooseVariant: no exact frame means a refusal with the nearest (P1)', () => {
  it('offers FHD for 2560x1440: the same aspect with the closest area', () => {
    const shot = item('LOGO_Shot');
    expect(chooseVariant(shot, frame(2560, 1440))).toEqual({ variant: null, match: 'none', nearest: variant(shot, '16x9') });
  });
  it('offers 4K when the frame area is closer to it', () => {
    expect(nearestKey(item('LOGO_Shot'), 3200, 1800)).toBe('16x9_4K');
    expect(nearestKey(item('LOGO_Shot'), 1280, 720)).toBe('16x9');
  });
  it('counts aspects within 1 % as the same', () => {
    expect(nearestKey(item('LOGO_Shot'), 1920, 1088)).toBe('16x9'); // 0.7 % off 16:9
    expect(nearestKey(item('TTL_LowerThird'), 1080, 1090)).toBe('1x1'); // 0.9 % off 1:1
  });
  it('decides by area inside the 1 % band and by aspect outside it', () => {
    const sized = (key: string, w: number, h: number): Variant => ({ key, w, h, minHostVersion: {} });
    const uhd = sized('uhd', 3840, 2160); // 0.74 % off 1920x1088, far in area
    const near = sized('near', 1904, 1088); // 0.84 % off: farther in aspect, closer in area
    const wide = sized('wide', 1920, 1072); // 1.5 % off: outside the band
    const target = { w: 1920, h: 1088 };
    expect(nearestVariant([uhd, near], target)?.key).toBe('near'); // both in the band: the closest area
    expect(nearestVariant([uhd, wide], target)?.key).toBe('uhd'); // only uhd in the band, though wide is closer in area
    expect(nearestVariant([wide], target)?.key).toBe('wide'); // no band: the closest aspect
  });
  it('without the same aspect takes the closest aspect, then the closest area', () => {
    expect(nearestKey(item('LOGO_Shot'), 1080, 1350)).toBe('9x16'); // 4:5
    expect(nearestKey(item('LOGO_Shot'), 1440, 1080)).toBe('16x9'); // 4:3
    expect(nearestKey(item('TTL_LowerThird'), 1080, 1350)).toBe('1x1');
    expect(nearestKey(item('LOGO_Shot'), 1920, 1100)).toBe('16x9'); // 1.8 % off 16:9: FHD and 4K tie, FHD is closer in area
  });
  it('keeps the library order on a tie', () => {
    const twin = (key: string): Variant => ({ key, w: 1920, h: 1080, minHostVersion: {} });
    expect(nearestVariant([twin('a'), twin('b')], { w: 2560, h: 1440 })?.key).toBe('a'); // same aspect, same area gap
    expect(nearestVariant([twin('a'), twin('b')], { w: 1000, h: 1000 })?.key).toBe('a'); // same aspect gap, same area gap
  });
  it('has nothing to offer without a target or a sized variant', () => {
    expect(chooseVariant(item('LOGO_Shot'), null)).toEqual({ variant: null, match: 'none' });
    expect(chooseVariant(item('LOGO_Shot'), frame(0, 1080))).toEqual({ variant: null, match: 'none' });
    expect(chooseVariant(item('LOGO_Shot'), frame(1920, 0))).toEqual({ variant: null, match: 'none' });
    expect(chooseVariant(item('LOGO_Shot'), frame(-1920, 1080))).toEqual({ variant: null, match: 'none' });
    const bare: Item = { ...item('LOGO_Shot'), variants: [{ key: 'any', minHostVersion: {} }] };
    expect(chooseVariant(bare, frame(1920, 1080))).toEqual({ variant: null, match: 'none' });
    // a size needs both sides above 0
    const half: Item = {
      ...item('LOGO_Shot'),
      variants: [
        { key: 'w-only', w: 1920, minHostVersion: {} },
        { key: 'h-only', h: 1080, minHostVersion: {} },
        { key: 'no-width', w: 0, h: 1080, minHostVersion: {} },
        { key: 'no-height', w: 1920, h: 0, minHostVersion: {} },
      ],
    };
    expect(chooseVariant(half, frame(1920, 1080))).toEqual({ variant: null, match: 'none' });
  });
});

describe('chooseVariant: the manual format chip', () => {
  it('wins over the frame when it names a variant', () => {
    const shot = item('LOGO_Shot');
    expect(chooseVariant(shot, frame(2560, 1440), '16x9')).toEqual({ variant: variant(shot, '16x9'), match: 'manual' });
    expect(chooseVariant(shot, frame(1920, 1080), '16x9_4K')).toEqual({ variant: variant(shot, '16x9_4K'), match: 'manual' });
    expect(chooseVariant(shot, null, '9x16')).toEqual({ variant: variant(shot, '9x16'), match: 'manual' });
  });
  it('is ignored when the item has no such variant (a key remembered before a library update)', () => {
    expect(chooseVariant(item('LOGO_Shot'), frame(1920, 1080), '1x1')).toMatchObject({ match: 'exact', variant: { key: '16x9' } });
    expect(chooseVariant(item('LOGO_Shot'), frame(2560, 1440), '')).toMatchObject({ match: 'none', nearest: { key: '16x9' } });
  });
});

describe('names', () => {
  it('gives the template (capsule) name of the variant file', () => {
    expect(templateName(variant(item('TTL_LowerThird'), '16x9_4K'))).toBe('TTL_LowerThird_16x9_4K_v1');
    expect(templateName({ key: 'x', minHostVersion: {} })).toBe('');
  });
  it('labels a frame with the multiplication sign', () => {
    expect(frameLabel(2560, 1440)).toBe('2560×1440');
  });
});
