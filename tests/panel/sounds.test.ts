// The sound library in the panel: «Звуки» with its groups, sounds kept out of the whole catalog, found by their
// group and source name, the stock music gone whole without its installer option, a sound placed as it is.
import { describe, expect, it } from 'vitest';
import { PanelApp, type Services } from '../../panel/src/app/controller';
import type { CallOptions, HostCaller, HostReply } from '../../panel/src/core/host';
import { planItem } from '../../panel/src/core/insert';
import { filterItems, installedOnly, usedSoundGroups } from '../../panel/src/core/library';
import { mediaKind } from '../../panel/src/core/media';
import { memoryStore } from '../../panel/src/core/memory';
import type { Catalog, HostContext, Item } from '../../panel/src/core/types';
import sounds from '../../library/sounds.src.json';
import { ALL_FONTS, catalog, prContext, toCatalogItem } from './fixtures';

const ROOT = 'C:/ProgramData/CloudRuBrandKit/library';
type Entry = { id: string; title_ru: string; group: string; keywords: string; sec: number; pack?: string };
const soundItems = (): Item[] => (sounds.sounds as Entry[]).map((e) => toCatalogItem({
  id: e.id, title_ru: e.title_ru, category: 'sounds', tier: 'T3', hosts: ['ae', 'pr'], version: 1, group: e.group, keywords: e.keywords,
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
    expect(all.some((i) => i.category === 'sounds')).toBe(false);
    expect(all.length).toBe(catalog().items.length);
    expect(filterItems(items, { category: 'sounds' }).length).toBe(sounds.sounds.length);
    // a search finds sounds by their Russian title, their group and their English source name
    expect(filterItems(items, { query: 'вжух 1' }).map((i) => i.id)).toContain('SFX_Whoosh1');
    expect(filterItems(items, { query: 'whoosh' }).every((i) => i.category === 'sounds')).toBe(true);
    expect(filterItems(items, { query: 'whoosh' }).length).toBeGreaterThan(20);
    expect(filterItems(items, { query: 'глитчи' }).every((i) => i.group === 'glitch')).toBe(true);
    expect(filterItems(items, { category: 'favorites', favorites: new Set(['SFX_Whoosh1']) }).map((i) => i.id)).toEqual(['SFX_Whoosh1']);
  });

  it('groups «Звуки» by the library\'s groups, in their order', () => {
    const items = withSounds().items;
    expect(usedSoundGroups(items).map((g) => g.key)).toEqual(['brand', 'music', 'whoosh', 'impact', 'riser', 'ui', 'glitch', 'texture', 'scifi', 'ambience', 'nature', 'city', 'foley']);
    const music = filterItems(items, { category: 'sounds', group: 'music' });
    expect(music.length).toBeGreaterThan(40);
    expect(music.every((i) => i.group === 'music')).toBe(true);
    // a group means nothing outside «Звуки»
    expect(filterItems(items, { category: 'logo', group: 'music' }).length).toBe(catalog().items.filter((i) => i.category === 'logo').length);
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
    expect(a.soundGroups().length).toBe(13);
    a.setSoundGroup('impact');
    expect(a.visibleItems().every((i) => i.group === 'impact')).toBe(true);
    a.setSoundGroup('impact');
    expect(a.state.soundGroup).toBeNull();
    a.setSoundGroup('ui');
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
