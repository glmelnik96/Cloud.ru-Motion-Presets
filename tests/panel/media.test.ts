// T2/T3 on the timeline (panel/src/core/media.ts) and their requests (insert.ts): loops, transitions, stills,
// sounds, the #222222 backdrop, companions of T1 templates.
import { describe, expect, it } from 'vitest';
import { planInsert, planItem, placementMismatches, runMedia, type MediaRequest } from '../../panel/src/core/insert';
import { itemsForHost } from '../../panel/src/core/library';
import { insertable, mediaKind, nearestCut, pickMediaVariant } from '../../panel/src/core/media';
import type { HostReply } from '../../panel/src/core/host';
import type { HostContext, Item } from '../../panel/src/core/types';
import { aeContext, ALL_FONTS, exampleCatalog, exampleItem, lookupExample, prContext } from './fixtures';

const env = { platform: 'win' as const, libraryRoot: 'C:/ProgramData/CloudRuBrandKit/library' };
const LIB = env.libraryRoot;
const ASSETS = 'C:/CRBK/work/pr/Cloud.ru BrandKit';

const plan = (item: Item, ctx: HostContext, options = {}) => planItem({ item, ctx, values: {}, fonts: ALL_FONTS, options, env, lookup: lookupExample });

describe('what the panel places', () => {
  it('tells the kind of each example item and hides what it cannot place', () => {
    const kinds = Object.fromEntries(exampleCatalog().items.filter((i) => i.tier !== 'T1').map((i) => [i.id, mediaKind(i, pickMediaVariant(i, { w: 1920, h: 1080 }).variant!)]));
    expect(kinds).toEqual({ SFX_WhooshIn: 'sound', BG_WebinarPortal: 'loop', TRN_StepWipe: 'transition', BG_Arrows: 'loop', BG_DotGrid: 'still', SFX_WebinarBed: 'sound' });
    const ffx: Item = { ...exampleItem('BG_DotGrid'), id: 'FX_Pop', variants: [{ key: 'ffx', file: 'items/FX_Pop/FX_Pop_ffx_v1.ffx', minHostVersion: {} }] };
    expect(insertable(ffx, 'ae')).toBe(false);
    const cat = exampleCatalog();
    cat.items.push(ffx);
    expect(itemsForHost(cat, 'ae').map((i) => i.id)).not.toContain('FX_Pop');
  });

  it('picks the PNG of a still, not its SVG twin', () => {
    expect(pickMediaVariant(exampleItem('BG_DotGrid'), { w: 1920, h: 1080 }).variant?.file).toBe('items/BG_DotGrid/BG_DotGrid_16x9_v1.png');
  });

  it('finds the nearest cut within five seconds, the earlier one on a tie', () => {
    expect(nearestCut([37.5, 44], 40)).toBe(37.5);
    expect(nearestCut([38, 42], 40)).toBe(38);
    expect(nearestCut([30, 50], 40)).toBeNull();
  });
});

describe('loops', () => {
  it('runs a loop with intro and outro up to the end of the work area, on a #222222 solid in AE', () => {
    const ctx = aeContext({ target: { kind: 'comp', id: '12', name: 'Main', w: 1920, h: 1080, fps: 25, timeSec: 2, durationSec: 30, rangeEndSec: 30 } });
    const p = plan(exampleItem('BG_Arrows'), ctx);
    expect(p.ok).toBe(true);
    const m = p.media!;
    expect(m).toMatchObject({ kind: 'loop', startSec: 2, lengthSec: 28, variant: { key: '16x9' } });
    const dir = 'C:/CRBK/work/user/Cloud.ru BrandKit/BG_Arrows@1';
    expect(m.layout.video).toEqual([
      { role: 'intro', source: `${LIB}/items/BG_Arrows/BG_Arrows_16x9_intro_v1.mov`, file: `${dir}/BG_Arrows_16x9_intro_v1.mov`, startSec: 2, lengthSec: 1 },
      { role: 'loop', source: `${LIB}/items/BG_Arrows/BG_Arrows_16x9_loop_v1.mov`, file: `${dir}/BG_Arrows_16x9_loop_v1.mov`, startSec: 3, lengthSec: 26, periodSec: 10 },
      { role: 'outro', source: `${LIB}/items/BG_Arrows/BG_Arrows_16x9_outro_v1.mov`, file: `${dir}/BG_Arrows_16x9_outro_v1.mov`, startSec: 29, lengthSec: 1 },
    ]);
    expect(m.layout.backdrop).toEqual({ color: [34, 34, 34], file: null, w: 1920, h: 1080, startSec: 2, lengthSec: 28 });
    expect(m.prepare).toEqual({ copies: m.layout.video.map((v) => ({ from: v.source, to: v.file })), solids: [] });
  });

  it('takes one period without a range after the playhead, and the backdrop can be switched off', () => {
    const p = plan(exampleItem('BG_Arrows'), prContext(), { backdrop: false });
    expect(p.media).toMatchObject({ startSec: 40, lengthSec: 12 });
    expect(p.media!.layout.backdrop).toBeNull();
  });

  it('refuses a loop shorter than its intro and outro', () => {
    const p = plan(exampleItem('BG_Arrows'), prContext(), { lengthSec: 1.5 });
    expect(p.ok).toBe(false);
    expect(p.problems.map((x) => x.code)).toEqual(['TOO_SHORT']);
  });

  it('writes the backdrop still for Premiere next to the project, once per frame size', () => {
    const p = plan(exampleItem('BG_DotGrid'), prContext(), { lengthSec: 8 });
    expect(p.media).toMatchObject({ kind: 'still', lengthSec: 8 });
    expect(p.media!.layout.video).toEqual([{ role: 'still', source: `${LIB}/items/BG_DotGrid/BG_DotGrid_16x9_v1.png`, file: `${ASSETS}/BG_DotGrid@1/BG_DotGrid_16x9_v1.png`, startSec: 40, lengthSec: 8 }]);
    expect(p.media!.prepare.solids).toEqual([{ path: `${ASSETS}/backdrop_222222_1920x1080.png`, w: 1920, h: 1080, color: [34, 34, 34] }]);
  });

  it('a loop that is not a background has no backdrop unless asked for', () => {
    const p = plan(exampleItem('BG_WebinarPortal'), prContext());
    expect(p.media!.layout.backdrop).toBeNull();
    expect(p.media!.layout.video).toEqual([expect.objectContaining({ role: 'loop', startSec: 40, lengthSec: 30, periodSec: 30 })]);
  });
});

describe('transitions', () => {
  it('Premiere: the marker of full cover meets the nearest cut', () => {
    const p = plan(exampleItem('TRN_StepWipe'), prContext(), { cuts: [37.6, 44] });
    expect(p.ok).toBe(true);
    expect(p.media!.layout.video).toEqual([expect.objectContaining({ role: 'transition', startSec: 37.12 })]);
    expect(p.media!.layout.video[0].lengthSec).toBeUndefined();
    expect(p.media!.layout.backdrop).toBeNull();
  });

  it('Premiere: no cut nearby puts the marker on the playhead and says so; a cut too early is refused', () => {
    const p = plan(exampleItem('TRN_StepWipe'), prContext(), { cuts: [] });
    expect(p.ok).toBe(true);
    expect(p.problems.map((x) => x.code)).toEqual(['NO_CUT']);
    expect(p.media!.startSec).toBe(39.52);
    const early = plan(exampleItem('TRN_StepWipe'), prContext({ target: { ...prContext().target!, timeSec: 0.2 } }), { cuts: [0.2] });
    expect(early.problems.map((x) => x.code)).toEqual(['TOO_EARLY']);
  });

  it('AE: the marker goes on the current time', () => {
    const p = plan(exampleItem('TRN_StepWipe'), aeContext());
    expect(p.media!.startSec).toBe(1.52);
  });
});

describe('sounds', () => {
  it('a sound goes on its own at the playhead with its natural length', () => {
    const p = plan(exampleItem('SFX_WhooshIn'), prContext());
    expect(p.media!.layout).toEqual({
      video: [],
      backdrop: null,
      audio: [{ role: 'sound', source: `${LIB}/items/SFX_WhooshIn/SFX_WhooshIn_wav_v1.wav`, file: `${ASSETS}/SFX_WhooshIn@1/SFX_WhooshIn_wav_v1.wav`, startSec: 40 }],
      scale: 1,
    });
  });
});

describe('companions of T1 templates', () => {
  const web = () => exampleItem('WEB_Screen');
  const insert = (item: Item, sound: { music: boolean; sfx: boolean }, ctx = prContext()) =>
    planInsert({ item, ctx, values: {}, fonts: ALL_FONTS, options: { sound }, env, lookup: lookupExample });

  it('the webinar screen gets its background loop under it for its whole length, music only when ticked', () => {
    const p = insert(web(), { music: false, sfx: true });
    expect(p.ok).toBe(true);
    const c = p.request!.companions!;
    expect(c.video).toEqual([{ role: 'loop', source: `${LIB}/items/BG_WebinarPortal/BG_WebinarPortal_16x9_loop_v1.mov`, file: `${ASSETS}/BG_WebinarPortal@1/BG_WebinarPortal_16x9_loop_v1.mov`, startSec: 40, lengthSec: 35, periodSec: 30 }]);
    expect(c.audio).toEqual([]);
    const withMusic = insert(web(), { music: true, sfx: true }).request!.companions!;
    expect(withMusic.audio).toEqual([expect.objectContaining({ role: 'sound', file: `${ASSETS}/SFX_WebinarBed@1/SFX_WebinarBed_wav_v1.wav`, startSec: 40, maxSec: 35 })]);
    expect(insert(web(), { music: true, sfx: true }).request!.prepare.copies).toHaveLength(2);
  });

  it('the lower third gets its whoosh at the start when sound effects are on, nothing when off', () => {
    const ttl = exampleItem('TTL_LowerThird');
    const on = insert(ttl, { music: false, sfx: true }).request!;
    expect(on.companions!.audio).toEqual([expect.objectContaining({ role: 'sound', startSec: 40, maxSec: 6 })]);
    expect(insert(ttl, { music: false, sfx: false }).request!.companions).toBeNull();
  });

  it('a sound placed out ends with the template', () => {
    const ttl = exampleItem('TTL_LowerThird');
    ttl.companions = [{ ref: 'SFX_WhooshIn', kind: 'sfx', placement: 'out', default: true }];
    const c = insert(ttl, { music: false, sfx: true }).request!.companions!;
    expect(c.audio).toEqual([expect.objectContaining({ endSec: 46, floorSec: 40 })]);
  });

  it('a missing companion is a warning, the template still goes in', () => {
    const ttl = exampleItem('TTL_LowerThird');
    ttl.companions = [{ ref: 'SFX_Gone', kind: 'sfx', placement: 'in', default: true }];
    const p = insert(ttl, { music: false, sfx: true });
    expect(p.ok).toBe(true);
    expect(p.problems.map((x) => x.code)).toEqual(['COMPANION']);
  });
});

describe('placement check and runMedia', () => {
  const request = (): MediaRequest => plan(exampleItem('BG_Arrows'), prContext(), { lengthSec: 12 }).media!;
  const placedOf = (r: MediaRequest) => [
    ...r.layout.video.map((v) => ({ role: v.role, name: v.file.split('/').pop()!, startSec: v.startSec!, lengthSec: v.lengthSec!, track: 3 })),
    { role: 'backdrop', name: 'backdrop', startSec: r.layout.backdrop!.startSec, lengthSec: r.layout.backdrop!.lengthSec, track: 2 },
  ];

  it('compares what the plan fixed, with half a frame of slack', () => {
    const r = request();
    const placed = placedOf(r);
    expect(placementMismatches(r.layout, placed, 25)).toEqual([]);
    placed[1] = { ...placed[1], lengthSec: placed[1].lengthSec + 0.04 };
    expect(placementMismatches(r.layout, placed, 25)).toEqual(['loop: длина 10.04 с вместо 10 с']);
    expect(placementMismatches(r.layout, placed.slice(0, 2), 25)).toContain('outro: не поставлен');
  });

  it('reports a timeout as done when the probe finds the file, never repeats the call', async () => {
    const r = request();
    const calls: string[] = [];
    const caller = {
      async call<T>(fn: string): Promise<HostReply<T>> {
        calls.push(fn);
        if (fn === 'insertMedia') return { ok: false, error: { code: 'TIMEOUT', message: 'slow' } };
        return { ok: true, data: { found: true } as T };
      },
    };
    const out = await runMedia(caller, 'pr', r, 1000);
    expect(out.ok).toBe(true);
    expect(out.problems.map((p) => p.code)).toEqual(['TIMEOUT']);
    expect(calls).toEqual(['insertMedia', 'probeInsert']);
  });

  it('turns a placement that does not match into an error', async () => {
    const r = request();
    const placed = placedOf(r);
    placed[0] = { ...placed[0], startSec: 41 };
    const caller = { async call<T>(): Promise<HostReply<T>> { return { ok: true, data: { name: 'x', startSec: 40, lengthSec: 12, placed, imported: 3 } as T }; } };
    const out = await runMedia(caller, 'pr', r);
    expect(out.ok).toBe(false);
    expect(out.problems[0].code).toBe('INSERT_FAILED');
  });
});
