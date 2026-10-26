// The sound library in the panel: «Звуки» with its groups, sounds kept out of the whole catalog, found by their
// group and source name, the stock music gone whole without its installer option, a sound placed as it is.
import { describe, expect, it } from 'vitest';
import { PanelApp, type Services } from '../../panel/src/app/controller';
import type { CallOptions, HostCaller, HostReply } from '../../panel/src/core/host';
import { planInsert, planItem } from '../../panel/src/core/insert';
import { filterItems, installedOnly, MUSIC_GROUPS, usedSoundGroups } from '../../panel/src/core/library';
import { mediaKind, soundBoxes } from '../../panel/src/core/media';
import { memoryStore } from '../../panel/src/core/memory';
import type { Catalog, HostContext, Item } from '../../panel/src/core/types';
import sounds from '../../library/sounds.src.json';
import src from '../../library/library.src.json';
import { ALL_FONTS, catalog, prContext, toCatalogItem } from './fixtures';

const ROOT = 'C:/ProgramData/CloudRuBrandKit/library';
type Entry = { id: string; title_ru: string; group: string; keywords: string; sec: number; pack?: string };
const soundItems = (): Item[] => (sounds.sounds as Entry[]).map((e) => toCatalogItem({
  id: e.id, title_ru: e.title_ru, category: MUSIC_GROUPS.some((g) => g.key === e.group) ? 'music' : 'sounds', tier: 'T3', hosts: ['ae', 'pr'], version: 1, group: e.group, keywords: e.keywords,
  duration: { introSec: 0, holdSec: e.sec, outroSec: 0 }, variants: [{ key: 'wav', ...(e.pack ? { pack: e.pack } : {}) }],
}));
const withSounds = (): Catalog => { const c = catalog(); c.items.push(...soundItems()); return c; };

class Host implements HostCaller {
  constructor(public ctx: HostContext) {}
  async call<T>(fn: string, _args?: unknown, _opts?: CallOptions): Promise<HostReply<T>> {
    if (fn === 'getContext') return { ok: true, data: this.ctx as T };
    if (fn === 'diag') return { ok: true, data: { app: 'Premiere' } as T };
    return { ok: false, error: { code: 'NO_FUNCTION', message: fn } };
  }
}

describe('the sound library', () => {
  it('keeps the sounds out of the whole catalog; «Звуки», a search and the favourites show them', () => {
    const items = withSounds().items;
    const all = filterItems(items, {});
    expect(all.some((i) => i.category === 'sounds' || i.category === 'music')).toBe(false);
    expect(all.length).toBe(catalog().items.length);
    expect(filterItems(items, { category: 'sounds' }).length + filterItems(items, { category: 'music' }).length).toBe(sounds.sounds.length);
    // a search finds sounds by their Russian title, their group and their English source name
    expect(filterItems(items, { query: 'вжух 1' }).map((i) => i.id)).toContain('SFX_Whoosh1');
    expect(filterItems(items, { query: 'whoosh' }).every((i) => i.category === 'sounds')).toBe(true);
    expect(filterItems(items, { query: 'whoosh' }).length).toBeGreaterThan(20);
    expect(filterItems(items, { query: 'глитчи' }).every((i) => i.group === 'glitch')).toBe(true);
    expect(filterItems(items, { category: 'favorites', favorites: new Set(['SFX_Whoosh1']) }).map((i) => i.id)).toEqual(['SFX_Whoosh1']);
  });

  it('groups «Звуки» and «Музыка» by their own groups, in their order', () => {
    const items = withSounds().items;
    expect(usedSoundGroups(items).map((g) => g.key)).toEqual(['brand', 'whoosh', 'impact', 'riser', 'ui', 'glitch', 'texture', 'scifi', 'ambience', 'nature', 'city', 'foley']);
    expect(usedSoundGroups(items, 'music').map((g) => g.key)).toEqual(['cloud', 'corporate', 'tech', 'cinematic', 'electronic', 'energetic', 'calm']);
    // music is a category of its own (user 2026-10-26): 48 tracks, none of them in «Звуки»
    const music = filterItems(items, { category: 'music' });
    expect(music.length).toBe(48);
    expect(filterItems(items, { category: 'sounds' }).some((i) => i.id.startsWith('SFX_Music'))).toBe(false);
    expect(filterItems(items, { category: 'music', group: 'cloud' }).map((i) => i.id).sort()).toEqual(['SFX_MusicCourseIntro', 'SFX_MusicPodcast', 'SFX_MusicWebinar30s', 'SFX_MusicWebinar5min']);
    // a group means nothing outside «Звуки» and «Музыка»
    expect(filterItems(items, { category: 'logo', group: 'cloud' }).length).toBe(catalog().items.filter((i) => i.category === 'logo').length);
  });

  it('leaves the stock music out whole when its option is not installed', () => {
    const c = withSounds();
    const pond5 = (sounds.sounds as Entry[]).filter((s) => s.pack === 'music').map((s) => s.id);
    expect(pond5.length).toBe(41);
    const out = installedOnly(c, ROOT, (p) => !pond5.some((id) => p.includes(`/${id}/`)));
    expect(out.items.length).toBe(c.items.length - 41);
    expect(out.items.some((i) => pond5.includes(i.id))).toBe(false);
    // the pack's own music stays: it comes with every install
    expect(out.items.find((i) => i.id === 'SFX_MusicWebinar5min')?.variants.length).toBe(1);
  });

  it('the controller shows the groups of «Звуки» only while it is open and drops the group on leaving', async () => {
    const a = new PanelApp({
      host: new Host(prContext()), hostKey: 'pr', pluginVersion: '0.1.0', platform: 'win', libraryRoot: ROOT,
      readLibrary: async () => JSON.stringify(withSounds()), store: memoryStore(),
      fonts: async (names) => Object.fromEntries(names.map((n) => [n, ALL_FONTS[n] ?? { found: false }])),
    } as Services);
    await a.init();
    expect(a.soundGroups()).toEqual([]);
    a.setCategory('sounds');
    expect(a.soundGroups().length).toBe(12);
    a.setSoundGroup('impact');
    expect(a.visibleItems().every((i) => i.group === 'impact')).toBe(true);
    a.setSoundGroup('impact');
    expect(a.state.soundGroup).toBeNull();
    a.setSoundGroup('ui');
    a.setCategory('music');
    expect([a.state.soundGroup, a.soundGroups().map((g) => g.key)]).toEqual([null, ['cloud', 'corporate', 'tech', 'cinematic', 'electronic', 'energetic', 'calm']]);
    a.setSoundGroup('calm');
    expect(a.visibleItems().every((i) => i.category === 'music' && i.group === 'calm')).toBe(true);
    a.setCategory('logo');
    expect([a.state.soundGroup, a.soundGroups()]).toEqual([null, []]);
  });

  it('places a sound at the playhead as long as its file', () => {
    const s = soundItems().find((i) => i.id === 'SFX_Whoosh1')!;
    expect(mediaKind(s, s.variants[0])).toBe('sound');
    const p = planItem({ item: s, ctx: prContext(), values: {}, fonts: ALL_FONTS, options: {}, env: { platform: 'win', libraryRoot: ROOT } });
    expect([p.ok, p.media?.kind, p.media?.layout.audio.length, p.media?.layout.video.length]).toEqual([true, 'sound', 1, 0]);
  });
});

describe('the music of the templates (D14)', () => {
  const real = (id: string) => toCatalogItem((src.items as unknown[]).find((i) => (i as Item).id === id), true);
  const lookup = (id: string) => [...soundItems(), real('BG_WebinarPortal')].find((i) => i.id === id);
  const env = { platform: 'win' as const, libraryRoot: ROOT };
  const music = (id: string, values: Record<string, number | boolean>, on = true) => {
    const p = planInsert({ item: real(id), ctx: prContext(), values, fonts: ALL_FONTS, options: { sound: { music: on, sfx: false } }, env, lookup });
    return (p.request?.companions?.audio ?? []).map((a) => a.file.split('/').pop());
  };

  it('the webinar screen plays the pack\'s music by «Таймер», as the pack did; off by default', () => {
    expect(music('WEB_Screen', { layout: 1, timer: true, minutes: 1 })).toEqual(['SFX_MusicWebinar5min_wav_v1.wav']);
    expect(music('WEB_Screen', { layout: 2, timer: false })).toEqual(['SFX_MusicWebinar30s_wav_v1.wav']);
    expect(music('WEB_Screen', { layout: 1, timer: true, minutes: 1 }, false)).toEqual([]);
    // under the screen from its start, no longer than the screen
    const p = planInsert({ item: real('WEB_Screen'), ctx: prContext(), values: { layout: 1, timer: true, minutes: 1 }, fonts: ALL_FONTS, options: { sound: { music: true, sfx: false } }, env, lookup });
    expect(p.request?.companions?.audio[0]).toMatchObject({ role: 'sound', startSec: p.request?.startSec, maxSec: 65 });
  });

  it('a course cover plays the courses\' intro music', () => {
    expect(music('CRS_Cover', { variant: 1 })).toEqual(['SFX_MusicCourseIntro_wav_v1.wav']);
  });
});

describe('the sound effects of the podcast templates (D14)', () => {
  const real = (id: string) => toCatalogItem((src.items as unknown[]).find((i) => (i as Item).id === id), true);
  const lookup = (id: string) => soundItems().find((i) => i.id === id);
  const env = { platform: 'win' as const, libraryRoot: ROOT };
  const plan = (id: string, values: Record<string, number | boolean>, sfx = true) =>
    planInsert({ item: real(id), ctx: prContext(), values, fonts: ALL_FONTS, options: { sound: { music: false, sfx } }, env, lookup });
  const files = (id: string, values: Record<string, number | boolean>, sfx = true) =>
    (plan(id, values, sfx).request?.companions?.audio ?? []).map((a) => a.file.split('/').pop());

  it('the podcast lower third comes in and leaves with its sounds: in from its start, out ending with it', () => {
    const p = plan('TTL_LowerThird', { style: 2 });
    const r = p.request!;
    expect(r.companions!.audio).toEqual([
      expect.objectContaining({ file: expect.stringMatching(/SFX_PodcastLowerThirdIn_wav_v1\.wav$/), startSec: r.startSec, maxSec: r.lengthSec }),
      expect.objectContaining({ file: expect.stringMatching(/SFX_PodcastLowerThirdOut_wav_v1\.wav$/), endSec: r.startSec + r.lengthSec, floorSec: r.startSec }),
    ]);
    // the parts play out whole: only a sound under the whole template fades
    expect(r.companions!.audio.every((a) => a.fadeOutSec === undefined)).toBe(true);
    expect(files('TTL_LowerThird', { style: 2 }, false)).toEqual([]);
  });

  it('only for the pack\'s look at 1×: the titles and webinar styles and another speed have none', () => {
    expect(files('TTL_LowerThird', { style: 1 })).toEqual([]);
    expect(files('TTL_LowerThird', { style: 3 })).toEqual([]);
    expect(files('TTL_LowerThird', { style: 2, speed: 5 })).toEqual([]);
    expect(files('TTL_Plate', { style: 1 })).toEqual(['SFX_PodcastTextPlateIn_wav_v1.wav', 'SFX_PodcastTextPlateOut_wav_v1.wav']);
    expect(files('TTL_Plate', { style: 2 })).toEqual([]);
  });

  it('the form picks the track: the content window by its side, the QR block by its layout', () => {
    expect(files('POD_Content', { side: 3 })).toEqual(['SFX_PodcastContent3In_wav_v1.wav', 'SFX_PodcastContent3Out_wav_v1.wav']);
    expect(files('POD_QR', { layout: 3 })).toEqual(['SFX_PodcastSubscribeIn_wav_v1.wav', 'SFX_PodcastSubscribeOut_wav_v1.wav']);
    // two QR codes take the left one's sounds
    expect(files('POD_QR', { layout: 4 })).toEqual(['SFX_PodcastQR1In_wav_v1.wav', 'SFX_PodcastQR1Out_wav_v1.wav']);
    expect(files('POD_Guest', {})).toEqual(['SFX_PodcastGuestIn_wav_v1.wav', 'SFX_PodcastGuestOut_wav_v1.wav']);
    expect(files('POD_Frame', {})).toEqual(['SFX_PodcastFrameIn_wav_v1.wav', 'SFX_PodcastFrameOut_wav_v1.wav']);
  });

  it('the disclaimer\'s bed runs under it and fades out where it ends', () => {
    const r = plan('TTL_Disclaimer', {}).request!;
    expect(r.companions!.audio).toEqual([expect.objectContaining({ file: expect.stringMatching(/SFX_PodcastDisclaimer_wav_v1\.wav$/), startSec: r.startSec, maxSec: r.lengthSec, fadeOutSec: 2 })]);
  });

  it('the checkbox says what the template\'s sounds need when the form does not fit them', () => {
    const lt = real('TTL_LowerThird');
    expect(soundBoxes(lt, { style: 2, speed: 2 })).toEqual({ music: null, sfx: { applies: true, needs: [] } });
    expect(soundBoxes(lt, { style: 1 })).toEqual({ music: null, sfx: { applies: false, needs: ['Стиль: Подкаст'] } });
    expect(soundBoxes(lt, { style: 3, speed: 5 }).sfx).toEqual({ applies: false, needs: ['Стиль: Подкаст', 'Скорость: 1×'] });
    // several looks of one condition: the closest one speaks
    expect(soundBoxes(real('POD_QR'), { layout: 2, speed: 1 }).sfx).toEqual({ applies: false, needs: ['Скорость: 1×'] });
    // the webinar screen: its music goes with either «Таймер», no sound effects
    expect(soundBoxes(real('WEB_Screen'), { timer: false })).toEqual({ music: { applies: true, needs: [] }, sfx: null });
    expect(soundBoxes(real('LOGO_Shot'), {})).toEqual({ music: null, sfx: null });
  });
});
