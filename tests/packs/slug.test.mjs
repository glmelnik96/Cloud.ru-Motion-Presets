import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlugs, compSlugs, translit } from '../../tools/packs/slug.mjs';

describe('slug', () => {
  it('transliterates Russian comp names into ASCII', () => {
    expect(slugify('Логошот_Умное облако')).toBe('logoshot_umnoe_oblako');
    expect(slugify('Подписывайся! Ссылки в описании')).toBe('podpisyvaysya_ssylki_v_opisanii');
    expect(slugify('Щука, ёж и Юля')).toBe('shchuka_ezh_i_yulya');
    expect(translit('Хэштег объём')).toBe('kheshteg obem');
  });
  it('gives the same slug for NFD and NFC names', () => {
    expect(slugify('Оверлей_1x1'.normalize('NFD'))).toBe('overley_1x1');
    expect(slugify('Оверлей_1x1'.normalize('NFC'))).toBe('overley_1x1');
  });
  it('keeps only [a-z0-9_] and trims separators', () => {
    expect(slugify('  QR_1')).toBe('qr_1');
    expect(slugify('Обложка #1')).toBe('oblozhka_1');
    expect(slugify('Cloud.ru_BlackMono 3')).toBe('cloud_ru_blackmono_3');
    expect(slugify('+')).toBe('plus');
    expect(slugify('Café')).toBe('cafe');
  });
  it('falls back for empty names and avoids Windows device names', () => {
    expect(slugify('!!!')).toBe('untitled');
    expect(slugify('CON')).toBe('con_');
  });
  it('caps the length at 64 characters', () => {
    const s = slugify('Очень длинное имя композиции '.repeat(5));
    expect(s.length).toBeLessThanOrEqual(64);
    expect(s.endsWith('_')).toBe(false);
  });
  it('makes repeated names unique in order', () => {
    expect(uniqueSlugs(['Подкаст', 'Подкаст', 'Подкаст_2', 'Pattern_1'])).toEqual(['podkast', 'podkast_2', 'podkast_2_2', 'pattern_1']);
    const long = 'Ж'.repeat(80);
    const [a, b] = uniqueSlugs([long, long]);
    expect(a.length).toBe(64);
    expect(b.length).toBe(64);
    expect(b.endsWith('_2')).toBe(true);
  });
  it('assigns comp slugs by ascending item id, whatever the input order', () => {
    const m = compSlugs([{ id: 40, name: 'Подкаст' }, { id: 7, name: 'Подкаст' }, { id: 12, name: 'Cloud.ru' }]);
    expect(m.get(7)).toBe('podkast');
    expect(m.get(40)).toBe('podkast_2');
    expect(m.get(12)).toBe('cloud_ru');
  });
});
