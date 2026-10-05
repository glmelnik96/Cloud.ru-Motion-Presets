import { describe, it, expect } from 'vitest';
import {
  cardOf, CATEGORY_LABELS, CATEGORY_ORDER, categoryChips, fileUrl, filterItems, normalizeQuery,
} from '../../../panel/src/ui/catalog';
import type { Item } from '../../../panel/src/core/types';
import { catalog, item } from '../core/fixture';

const ROOT = 'C:/CRBK/work/library';
const pack1 = () => catalog().items;
const titled = (title: string, category = 'logo'): Item => ({ ...item('LOGO_Mark'), id: 'LOGO_X', title_ru: title, category });

describe('category labels', () => {
  it('names every category of the schema in Russian, in the order of the spec', () => {
    expect(CATEGORY_ORDER).toEqual([
      'logo', 'titles', 'webinars', 'courses', 'smm', 'podcast', 'transitions', 'backgrounds', 'effects', 'sounds', 'export',
    ]);
    expect(CATEGORY_ORDER.map((c) => CATEGORY_LABELS[c])).toEqual([
      'Логотипы', 'Титры', 'Вебинары', 'Курсы', 'SMM', 'Подкаст', 'Переходы', 'Фоны', 'Эффекты', 'Звуки', 'Экспорт',
    ]);
  });
});

describe('categoryChips', () => {
  it('has an all chip and a chip per category that has items, in the order of the spec', () => {
    expect(categoryChips(pack1())).toEqual([
      { key: 'all', label: 'Все', count: 3 },
      { key: 'logo', label: 'Логотипы', count: 2 },
      { key: 'titles', label: 'Титры', count: 1 },
    ]);
    // the order is the spec's, not the library's
    const swapped = [titled('b', 'titles'), titled('a', 'logo')];
    expect(categoryChips(swapped).map((c) => c.key)).toEqual(['all', 'logo', 'titles']);
  });

  it('never shows a chip for an empty category', () => {
    const keys = categoryChips(pack1()).map((c) => c.key);
    for (const empty of ['webinars', 'courses', 'smm', 'podcast', 'transitions', 'backgrounds', 'effects', 'sounds', 'export']) {
      expect(keys).not.toContain(empty);
    }
  });

  it('shows no chips when there is nothing to choose between', () => {
    expect(categoryChips([])).toEqual([]);
    expect(categoryChips([titled('one'), titled('two')])).toEqual([]);
  });

  it('keeps a category the panel does not know, after the known ones, under its own name', () => {
    const chips = categoryChips([titled('a', 'logo'), titled('b', 'stickers')]);
    expect(chips.map((c) => [c.key, c.label])).toEqual([['all', 'Все'], ['logo', 'Логотипы'], ['stickers', 'stickers']]);
  });
});

describe('search', () => {
  it('folds case and the letter yo, and ignores extra spaces', () => {
    expect(normalizeQuery('  ЁЛКА   Новая ')).toBe('елка новая');
    expect(normalizeQuery('')).toBe('');
  });

  it('matches title_ru by substring, case-insensitively', () => {
    expect(filterItems(pack1(), 'спикер', 'all').map((i) => i.id)).toEqual(['TTL_LowerThird']);
    expect(filterItems(pack1(), 'ЛОГО', 'all').map((i) => i.id)).toEqual(['LOGO_Shot', 'LOGO_Mark']);
    expect(filterItems(pack1(), 'логошот', 'all').map((i) => i.id)).toEqual(['LOGO_Shot']);
  });

  it('wants every word of the query, in any order', () => {
    expect(filterItems(pack1(), 'логотип подписи', 'all').map((i) => i.id)).toEqual(['LOGO_Mark']);
    expect(filterItems(pack1(), 'подписи логотип', 'all').map((i) => i.id)).toEqual(['LOGO_Mark']);
    expect(filterItems(pack1(), 'логотип спикер', 'all')).toEqual([]);
  });

  it('treats yo and ye alike', () => {
    const items = [titled('Ёлочная гирлянда'), titled('Берёзовая роща')];
    expect(filterItems(items, 'елочная', 'all')).toHaveLength(1);
    expect(filterItems(items, 'берёзовая', 'all')).toHaveLength(1);
    expect(filterItems(items, 'березовая', 'all')).toHaveLength(1);
  });

  it('searches the title only, not the id or the category', () => {
    expect(filterItems(pack1(), 'TTL_LowerThird', 'all')).toEqual([]);
    expect(filterItems(pack1(), 'титры', 'all')).toEqual([]);
  });

  it('returns everything for an empty query and narrows by category', () => {
    expect(filterItems(pack1(), '', 'all')).toHaveLength(3);
    expect(filterItems(pack1(), '   ', 'all')).toHaveLength(3);
    expect(filterItems(pack1(), '', 'logo').map((i) => i.id)).toEqual(['LOGO_Shot', 'LOGO_Mark']);
    expect(filterItems(pack1(), 'логотип', 'titles')).toEqual([]);
    expect(filterItems(pack1(), '', 'webinars')).toEqual([]);
  });

  it('does not touch the library order or the list it was given', () => {
    const items = pack1();
    const before = items.map((i) => i.id);
    filterItems(items, 'о', 'all');
    expect(items.map((i) => i.id)).toEqual(before);
  });
});

describe('fileUrl', () => {
  it('makes a file URL from a Windows root and a library-relative path', () => {
    expect(fileUrl(ROOT, 'items/TTL_LowerThird/poster.jpg')).toBe('file:///C:/CRBK/work/library/items/TTL_LowerThird/poster.jpg');
  });

  it('encodes each segment: spaces and Cyrillic', () => {
    expect(fileUrl('D:/Бренд кит/библиотека', 'items/LOGO_Mark/preview.mp4')).toBe(
      'file:///D:/%D0%91%D1%80%D0%B5%D0%BD%D0%B4%20%D0%BA%D0%B8%D1%82/%D0%B1%D0%B8%D0%B1%D0%BB%D0%B8%D0%BE%D1%82%D0%B5%D0%BA%D0%B0/items/LOGO_Mark/preview.mp4',
    );
    expect(fileUrl('C:/Users/Глеб/Documents/Cloud.ru Preset plugin/lib', 'a.jpg')).toBe(
      'file:///C:/Users/%D0%93%D0%BB%D0%B5%D0%B1/Documents/Cloud.ru%20Preset%20plugin/lib/a.jpg',
    );
    // the URL decodes back to the path
    expect(decodeURIComponent(fileUrl('D:/Бренд кит/lib', 'x y.jpg'))).toBe('file:///D:/Бренд кит/lib/x y.jpg');
  });

  it('encodes what would end the path of a URL: # and ?', () => {
    expect(fileUrl('C:/C# projects/what?/lib', 'items/a.jpg')).toBe('file:///C:/C%23%20projects/what%3F/lib/items/a.jpg');
    expect(fileUrl('C:/lib', 'items/100%/a.jpg')).toBe('file:///C:/lib/items/100%25/a.jpg');
  });

  it('takes backslashes, a trailing slash and a leading slash of the relative path', () => {
    expect(fileUrl('C:\\CRBK\\work\\library\\', '/items/A/poster.jpg')).toBe('file:///C:/CRBK/work/library/items/A/poster.jpg');
    expect(fileUrl('c:/lib///', 'items\\A\\p.jpg')).toBe('file:///c:/lib/items/A/p.jpg');
  });

  it('keeps the drive letter as it is', () => {
    expect(fileUrl('C:/lib', 'a.jpg')).toBe('file:///C:/lib/a.jpg');
    expect(fileUrl('C:/', 'a.jpg')).toBe('file:///C:/a.jpg');
  });

  it('makes a Mac path and a network path', () => {
    expect(fileUrl('/Users/Shared/CloudRuBrandKit/library', 'items/A/preview.mp4')).toBe(
      'file:///Users/Shared/CloudRuBrandKit/library/items/A/preview.mp4',
    );
    expect(fileUrl('//server/share/BrandKit', 'items/A/preview.mp4')).toBe('file://server/share/BrandKit/items/A/preview.mp4');
    expect(fileUrl('\\\\server\\share\\Бренд', 'a.jpg')).toBe('file://server/share/%D0%91%D1%80%D0%B5%D0%BD%D0%B4/a.jpg');
  });

  it('skips empty and dot segments instead of climbing out of the library', () => {
    expect(fileUrl('C:/lib', 'items//A/./poster.jpg')).toBe('file:///C:/lib/items/A/poster.jpg');
    expect(fileUrl('C:/lib', '../secret.txt')).toBe('file:///C:/lib/secret.txt');
    expect(fileUrl('C:/lib', 'items/../../secret.txt')).toBe('file:///C:/lib/items/secret.txt');
  });
});

describe('cardOf', () => {
  const withMedia = (): Item => ({
    ...item('TTL_LowerThird'),
    preview: { file: 'items/TTL_LowerThird/preview.mp4', sha256: 'a'.repeat(64), bytes: 1 },
    poster: { file: 'items/TTL_LowerThird/poster.jpg', sha256: 'b'.repeat(64), bytes: 1 },
  });

  it('has the title, the category in Russian and the poster and preview as file URLs from the library root', () => {
    expect(cardOf(withMedia(), ROOT)).toEqual({
      id: 'TTL_LowerThird',
      title: 'Подпись спикера',
      category: 'Титры',
      poster: 'file:///C:/CRBK/work/library/items/TTL_LowerThird/poster.jpg',
      preview: 'file:///C:/CRBK/work/library/items/TTL_LowerThird/preview.mp4',
      formats: '16:9 · 9:16 · 1:1',
    });
  });

  it('has no URL for a file the item does not have', () => {
    const card = cardOf(item('LOGO_Shot'), ROOT);
    expect(card.poster).toBeNull();
    expect(card.preview).toBeNull();
    expect(card.formats).toBe('16:9 · 9:16');
  });

  it('names the formats once even when the aspect has two sizes', () => {
    // LOGO_Shot has 16x9, 16x9_4K and 9x16: two 16:9
    expect(item('LOGO_Shot').variants.map((v) => v.key)).toEqual(['16x9', '16x9_4K', '9x16']);
    expect(cardOf(item('LOGO_Shot'), ROOT).formats).toBe('16:9 · 9:16');
  });

  it('builds URLs for a library on a path with spaces and Cyrillic', () => {
    expect(cardOf(withMedia(), 'D:/Мой бренд/lib').poster).toBe(
      'file:///D:/%D0%9C%D0%BE%D0%B9%20%D0%B1%D1%80%D0%B5%D0%BD%D0%B4/lib/items/TTL_LowerThird/poster.jpg',
    );
  });
});
