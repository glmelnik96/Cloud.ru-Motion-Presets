// The catalog screen as data (spec 7): the search over title_ru, the category chips (only for categories that have
// items), and the cards with their poster and preview as file:/// URLs under the library root. Pure: no DOM.
import type { Item } from '../core/types';
import { variantAspect } from './format';

// The categories of the schema, in the order of the spec's chip row (Избранное is not in the first slice).
export const CATEGORY_ORDER: readonly string[] = [
  'logo', 'titles', 'webinars', 'courses', 'smm', 'podcast', 'transitions', 'backgrounds', 'effects', 'sounds', 'export',
];

export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  logo: 'Логотипы',
  titles: 'Титры',
  webinars: 'Вебинары',
  courses: 'Курсы',
  smm: 'SMM',
  podcast: 'Подкаст',
  transitions: 'Переходы',
  backgrounds: 'Фоны',
  effects: 'Эффекты',
  sounds: 'Звуки',
  export: 'Экспорт',
};

export const ALL = 'all';

export interface Chip {
  key: string;
  label: string;
  count: number;
}

export interface Card {
  id: string;
  title: string;
  category: string; // in Russian
  poster: string | null; // file URL
  preview: string | null; // file URL
  formats: string; // '16:9 · 9:16 · 1:1'
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export const categoryLabel = (key: string): string => (own(CATEGORY_LABELS, key) ? (CATEGORY_LABELS[key] as string) : key);

// 'all' plus a chip per category that has an item: known categories in the spec's order, then any other one. With
// fewer than two such categories there is nothing to choose between, so no chips.
export function categoryChips(items: readonly Item[]): Chip[] {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  if (counts.size < 2) return [];
  const known = CATEGORY_ORDER.filter((key) => counts.has(key));
  const other = [...counts.keys()].filter((key) => !CATEGORY_ORDER.includes(key));
  return [
    { key: ALL, label: 'Все', count: items.length },
    ...[...known, ...other].map((key) => ({ key, label: categoryLabel(key), count: counts.get(key) ?? 0 })),
  ];
}

// Lower case, 'ё' as 'е', single spaces: a person types «елка» for «Ёлка».
export function normalizeQuery(text: string): string {
  return String(text).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

// Every word of the query must be in title_ru, in any order. The title only: the id and the category are not what
// a person reads on a card.
export function filterItems(items: readonly Item[], query: string, category: string): Item[] {
  const words = normalizeQuery(query).split(' ').filter(Boolean);
  return items.filter((it) => {
    if (category !== ALL && it.category !== category) return false;
    const title = normalizeQuery(it.title_ru);
    return words.every((w) => title.includes(w));
  });
}

// file:///C:/CRBK/work/library/items/A/poster.jpg. Each segment is percent-encoded on its own, so a space, Cyrillic
// or a '#' in a folder name stays in its segment (encodeURI would leave # and ? to end the path). The drive letter
// stays as it is; '.', '..' and empty segments are dropped: a library file never leaves its root.
export function fileUrl(root: string, rel: string): string {
  const all = String(root).replace(/\\/g, '/');
  const unc = all.startsWith('//');
  const parts = (text: string) => text.split('/').filter((s) => s !== '' && s !== '.' && s !== '..');
  const segments = [...parts(all), ...parts(String(rel).replace(/\\/g, '/'))];
  const drive = !unc && /^[A-Za-z]:$/.test(segments[0] ?? '') ? segments.shift() : undefined;
  const server = unc ? segments.shift() : undefined;
  const path = segments.map(encodeURIComponent).join('/');
  if (drive !== undefined) return 'file:///' + drive + '/' + path;
  if (server !== undefined) return 'file://' + server + '/' + path;
  return 'file:///' + path;
}

export function cardOf(item: Item, root: string): Card {
  const formats: string[] = [];
  for (const v of item.variants) {
    const label = variantAspect(v);
    if (label && !formats.includes(label)) formats.push(label);
  }
  return {
    id: item.id,
    title: item.title_ru,
    category: categoryLabel(item.category),
    poster: item.poster ? fileUrl(root, item.poster.file) : null,
    preview: item.preview ? fileUrl(root, item.preview.file) : null,
    formats: formats.join(' · '),
  };
}
