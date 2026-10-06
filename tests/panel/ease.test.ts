// «Фирменные кривые» (panel/src/core/ease.ts): the curves of the canon (brand/tokens.json, D19) as AE ease, the
// plan of the call and what the reply of the adapter becomes.
import { describe, expect, it } from 'vitest';
import { brandCurves, easeOf, planEase, runEase } from '../../panel/src/core/ease';
import type { HostCaller } from '../../panel/src/core/host';
import type { HostContext } from '../../panel/src/core/types';

const ae = (target = true): HostContext => ({ host: 'ae', version: '26.5', project: { saved: true, path: null }, target: target ? { kind: 'comp', id: '7', name: 'Main', w: 1920, h: 1080, fps: 25, timeSec: 0, durationSec: 10 } : null });
const answer = (a: unknown): HostCaller => ({ call: async () => a }) as unknown as HostCaller;

describe('brand curves', () => {
  it('a bezier with y 0 and 1 is a pair of keys with speed 0; the rest is not a curve for keys', () => {
    expect(easeOf([0.333, 0, 0, 1])).toEqual({ outInfluence: 33.3, inInfluence: 100 });
    expect(easeOf([0.67, 0, 0.11, 1])).toEqual({ outInfluence: 67, inInfluence: 89 });
    expect(easeOf([0.28, 1.24, 0.34, 1])).toBeNull();
    expect(easeOf([0.33, 0.33, 0.67, 0.67])).toBeNull();
  });

  it('every curve of the canon that fits keys, by type and style, with the frames of the canon', () => {
    const list = brandCurves();
    expect(list.map((c) => c.key)).toEqual(expect.arrayContaining(['M1.titles.in', 'M1.titles.out', 'M2.podcast.in', 'M4.in', 'M4.out', 'M8.stroke', 'M10.segment']));
    expect(list.find((c) => c.key === 'M1.titles.in')).toEqual({ key: 'M1.titles.in', group: 'Плашка по X (M1): титры', label: 'вход', frames: 20, bezier: [0.333, 0, 0, 1], outInfluence: 33.3, inInfluence: 100 });
    expect(list.find((c) => c.key === 'M4.in')).toMatchObject({ frames: 29, outInfluence: 67, inInfluence: 89 });
    // keys of AE (M6, M12) and expressions (M7, M9, M11) are not a curve for two keys
    expect(list.some((c) => /^M(6|7|9|11|12)\./.test(c.key))).toBe(false);
    // every influence is one AE accepts
    expect(list.every((c) => c.outInfluence >= 0.1 && c.outInfluence <= 100 && c.inInfluence >= 0.1 && c.inInfluence <= 100)).toBe(true);
  });

  it('a synthetic canon: styles and plain types, linear and keyed entries left out', () => {
    const motion = { fps: 25, M1: { styles: { titles: { in: { frames: 20, bezier: [0.5, 0, 0.5, 1] }, stagger: 1 } } }, M3: { words: { frames: 11, linear: true }, position: { frames: 16, bezier: [0.8, 0, 0.2, 1] } }, M6: { keys: [] } };
    expect(brandCurves(motion).map((c) => [c.key, c.group, c.label])).toEqual([['M1.titles.in', 'Плашка по X (M1): титры', 'вход'], ['M3.position', 'Подъём строк (M3)', 'позиция']]);
  });
});

describe('plan and run', () => {
  const curve = brandCurves().find((c) => c.key === 'M4.in');

  it('After Effects with a comp only', () => {
    expect(planEase(ae(), curve).request).toEqual({ targetId: '7', curve: 'M4.in', outInfluence: 67, inInfluence: 89, undoLabel: 'BrandKit: кривая Вскрытие маской (M4), вход' });
    expect(planEase({ ...ae(), host: 'pr' }, curve).problems[0].code).toBe('NOT_SUPPORTED');
    expect(planEase(ae(false), curve).problems[0].code).toBe('NO_TARGET');
    expect(planEase(ae(), undefined).problems[0].code).toBe('NOT_SUPPORTED');
  });

  it('keys set, one key only, nothing selected', async () => {
    const req = planEase(ae(), curve).request!;
    expect(await runEase(answer({ ok: true, data: { props: [{ name: 'Position', layer: 'A', pairs: 2 }], single: ['Scale'] } }), req)).toMatchObject({ ok: true, problems: [{ code: 'EASE_SINGLE', severity: 'warning' }] });
    expect((await runEase(answer({ ok: true, data: { props: [], single: ['Scale'] } }), req)).problems[0]).toMatchObject({ code: 'EASE_NO_KEYS', message: expect.stringContaining('у Scale выделен один ключ') });
    expect((await runEase(answer({ ok: true, data: { props: [], single: [] } }), req)).problems[0].message).toMatch(/хотя бы два ключа/);
    expect((await runEase(answer({ ok: false, error: { code: 'NO_TARGET', message: '' } }), req)).problems[0].code).toBe('NO_TARGET');
  });
});
