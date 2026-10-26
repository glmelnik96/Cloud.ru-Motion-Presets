// Reading library.json in the panel (spec 4.4, 6): the pipeline has validated the catalog against its schema,
// so the panel checks only what it relies on and drops a broken item instead of refusing the whole library.
import { insertable } from './media';
import { error, messages, warning, type Problem } from './problems';
import { libraryFile } from './paths';
import type { Catalog, Category, Host, Item, SoundGroup, Variant } from './types';
import { atLeast } from './version';

export const CATEGORIES: Array<{ key: Category; label_ru: string }> = [
  { key: 'logo', label_ru: 'Логотипы' },
  { key: 'titles', label_ru: 'Титры' },
  { key: 'webinars', label_ru: 'Вебинары' },
  { key: 'courses', label_ru: 'Курсы' },
  { key: 'smm', label_ru: 'SMM' },
  { key: 'podcast', label_ru: 'Подкаст' },
  { key: 'transitions', label_ru: 'Переходы' },
  { key: 'backgrounds', label_ru: 'Фоны' },
  { key: 'effects', label_ru: 'Эффекты' },
  { key: 'sounds', label_ru: 'Звуки' },
  { key: 'music', label_ru: 'Музыка' },
  { key: 'export', label_ru: 'Экспорт' },
];

// Groups of «Звуки» and of «Музыка» in the panel order (tools/sounds/process.mjs has the same lists).
export const SOUND_GROUPS: Array<{ key: SoundGroup; label_ru: string }> = [
  { key: 'brand', label_ru: 'Фирменные' },
  { key: 'whoosh', label_ru: 'Переходы' },
  { key: 'impact', label_ru: 'Удары' },
  { key: 'riser', label_ru: 'Подъёмы и спады' },
  { key: 'ui', label_ru: 'Интерфейс' },
  { key: 'glitch', label_ru: 'Глитчи' },
  { key: 'texture', label_ru: 'Бумага и скотч' },
  { key: 'scifi', label_ru: 'Техно и sci-fi' },
  { key: 'ambience', label_ru: 'Атмосферы' },
  { key: 'nature', label_ru: 'Природа' },
  { key: 'city', label_ru: 'Город и люди' },
  { key: 'foley', label_ru: 'Бытовые' },
];

export const MUSIC_GROUPS: Array<{ key: SoundGroup; label_ru: string }> = [
  { key: 'cloud', label_ru: 'Cloud.ru' },
  { key: 'corporate', label_ru: 'Корпоративная' },
  { key: 'tech', label_ru: 'Технологии' },
  { key: 'cinematic', label_ru: 'Кинематографичная' },
  { key: 'electronic', label_ru: 'Электроника' },
  { key: 'energetic', label_ru: 'Энергичная' },
  { key: 'calm', label_ru: 'Спокойная' },
];

// The categories listed by sound, not by picture: they have groups and the whole catalog leaves them out.
const LISTENED: ReadonlyArray<Category | 'favorites' | null | undefined> = ['sounds', 'music'];
const groupsOf = (category: Category | 'favorites' | null | undefined) => (category === 'music' ? MUSIC_GROUPS : category === 'sounds' ? SOUND_GROUPS : []);

export const groupLabel = (g: SoundGroup | undefined): string => [...SOUND_GROUPS, ...MUSIC_GROUPS].find((x) => x.key === g)?.label_ru ?? '';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Why an item cannot be used, or null. Mirrors the parts of the schema the core and the adapters read.
export function itemDefect(it: unknown): string | null {
  if (!isObj(it)) return 'not an object';
  if (typeof it.id !== 'string' || !it.id) return 'no id';
  if (!['T1', 'T2', 'T3'].includes(it.tier as string)) return 'bad tier';
  if (!Array.isArray(it.hosts) || !it.hosts.length) return 'no hosts';
  if (!Number.isInteger(it.version)) return 'no version';
  if (!Array.isArray(it.variants) || !it.variants.length) return 'no variants';
  for (const v of it.variants as unknown[]) {
    if (!isObj(v) || typeof v.key !== 'string') return 'bad variant';
  }
  if (it.tier === 'T1') {
    const d = it.duration;
    if (it.fit !== 'rdt' && it.fit !== 'trim') return 'T1 without fit';
    if (!isObj(d) || typeof d.introSec !== 'number' || typeof d.holdSec !== 'number' || typeof d.outroSec !== 'number') {
      return 'T1 without duration';
    }
  }
  if (it.fields !== undefined && !Array.isArray(it.fields)) return 'bad fields';
  return null;
}

export interface LoadedLibrary {
  catalog: Catalog | null;
  problems: Problem[];
}

// D24: the variants of an installer option («4k») whose files this install lacks are left out; the item keeps the
// options it lost (packsMissing) for the hint that the installer with the option adds them.
export function installedOnly(catalog: Catalog, root: string, exists: (path: string) => boolean): Catalog {
  const files = (v: Variant) => [v.file, ...Object.values(v.parts ?? {}).map((p) => p?.file)].filter((f): f is string => Boolean(f));
  const items = catalog.items.map((it) => {
    const lost = it.variants.filter((v) => v.pack && !files(v).every((f) => exists(libraryFile(root, f))));
    if (!lost.length) return it;
    return { ...it, variants: it.variants.filter((v) => !lost.includes(v)), packsMissing: [...new Set(lost.map((v) => v.pack as string))] };
  });
  // an item the option brings whole (the stock music) is not there at all
  return { ...catalog, items: items.filter((it) => it.variants.length) };
}

export function parseCatalog(input: string | unknown, pluginVersion: string): LoadedLibrary {
  let doc: unknown = input;
  if (typeof input === 'string') {
    try {
      doc = JSON.parse(input.charCodeAt(0) === 0xfeff ? input.slice(1) : input);
    } catch (e) {
      return { catalog: null, problems: [error('LIBRARY', messages.library('library.json не читается'), String(e))] };
    }
  }
  if (!isObj(doc) || doc.schemaVersion !== 1 || !Array.isArray(doc.items) || typeof doc.libraryVersion !== 'string') {
    return { catalog: null, problems: [error('LIBRARY', messages.library('неизвестный формат library.json'))] };
  }
  const minPlugin = typeof doc.minPluginVersion === 'string' ? doc.minPluginVersion : '0.0.0';
  if (!atLeast(pluginVersion, minPlugin)) {
    return { catalog: null, problems: [error('PLUGIN_TOO_OLD', messages.pluginTooOld(doc.libraryVersion, minPlugin, pluginVersion))] };
  }
  const problems: Problem[] = [];
  const items: Item[] = [];
  const seen = new Set<string>();
  for (const it of doc.items) {
    const defect = itemDefect(it);
    const id = isObj(it) && typeof it.id === 'string' ? it.id : '?';
    if (defect || seen.has(id)) {
      problems.push(warning('LIBRARY', messages.library(`элемент ${id} пропущен`), defect || 'duplicate id'));
      continue;
    }
    seen.add(id);
    items.push(it as unknown as Item);
  }
  return { catalog: { ...(doc as unknown as Catalog), items }, problems };
}

// Items a host can insert; the rest are hidden, not greyed out (spec 7). A T2/T3 item needs a file the panel
// places (.mov, .png, .wav); presets and export files wait for their tabs.
export function itemsForHost(catalog: Catalog, host: Host): Item[] {
  return catalog.items.filter((it) => insertable(it, host));
}

// Case- and ё-insensitive search over the Russian title and the id; words may come in any order.
export function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

export interface Filter {
  query?: string;
  category?: Category | 'favorites' | null;
  favorites?: ReadonlySet<string>;
  // a group of «Звуки» or «Музыка»
  group?: SoundGroup | null;
}

// The whole catalog without a category or a query leaves the sounds and the music out: hundreds of them would bury the
// templates; they are in «Звуки» and «Музыка», in «Избранное» and in what a search finds. A sound is found by its group
// and its source name too.
export function filterItems(items: Item[], f: Filter): Item[] {
  const words = normalizeQuery(f.query ?? '').split(' ').filter(Boolean);
  return items.filter((it) => {
    if (f.category === 'favorites' && !f.favorites?.has(it.id)) return false;
    if (f.category && f.category !== 'favorites' && it.category !== f.category) return false;
    if (!f.category && !words.length && LISTENED.includes(it.category)) return false;
    if (f.group && LISTENED.includes(f.category) && it.group !== f.group) return false;
    const hay = normalizeQuery(`${it.title_ru} ${it.id} ${it.keywords ?? ''} ${groupLabel(it.group)}`);
    return words.every((w) => hay.includes(w));
  });
}

// Groups of «Звуки» or «Музыка» that have at least one item, in the panel order.
export function usedSoundGroups(items: Item[], category: Category | 'favorites' | null = 'sounds'): typeof SOUND_GROUPS {
  const used = new Set(items.filter((it) => it.category === category).map((it) => it.group));
  return groupsOf(category).filter((g) => used.has(g.key));
}

// Categories that have at least one item, in the panel order.
export function usedCategories(items: Item[]): typeof CATEGORIES {
  const used = new Set(items.map((it) => it.category));
  return CATEGORIES.filter((c) => used.has(c.key));
}
