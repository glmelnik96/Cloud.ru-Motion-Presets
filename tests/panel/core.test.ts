import { describe, expect, it } from 'vitest';
import { colorProblems, fontBuild, fontProblems } from '../../panel/src/core/checks';
import { fieldMode, formFields, hostValue, initialValues, isActive, rememberable, validateValues, writesFor } from '../../panel/src/core/fields';
import { filterItems, itemsForHost, parseCatalog, usedCategories } from '../../panel/src/core/library';
import { FieldMemory, memoryStore } from '../../panel/src/core/memory';
import { basename, dirname, joinPath, libraryRoot, logDir, projectAssetDir, projectPathProblem } from '../../panel/src/core/paths';
import { defaultLengthSec, minLengthSec, planLength, remapKeys, templateSec, toFrames } from '../../panel/src/core/timing';
import { pickVariant, variantLabel } from '../../panel/src/core/variant';
import { atLeast, compareVersions, parseVersion, shortVersion } from '../../panel/src/core/version';
import { catalog, item, webScreen } from './fixtures';

describe('version', () => {
  it('reads AE, Premiere and plugin versions', () => {
    expect(parseVersion('26.5x89')).toEqual([26, 5]);
    expect(parseVersion('26.5.2')).toEqual([26, 5, 2]);
    expect(parseVersion('beta')).toEqual([]);
    expect(shortVersion('26.5x89')).toBe('26.5');
  });
  it('compares with missing parts as zero', () => {
    expect(compareVersions('26', '26.0.0')).toBe(0);
    expect(compareVersions('26.5.2', '26.10')).toBe(-1);
    expect(atLeast('26.5x89', '26.0')).toBe(true);
    expect(atLeast('25.6', '26.0')).toBe(false);
    expect(atLeast('', '26.0')).toBe(false);
  });
});

describe('library', () => {
  it('loads the first pack', () => {
    const r = parseCatalog(JSON.stringify(catalog()), '0.1.0');
    expect(r.problems).toEqual([]);
    expect(r.catalog?.items.map((i) => i.id)).toEqual(['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']);
  });
  it('refuses a library that is not JSON or needs a newer panel', () => {
    expect(parseCatalog('{', '0.1.0').problems[0].code).toBe('LIBRARY');
    const r = parseCatalog({ ...catalog(), minPluginVersion: '1.2.0' }, '1.1.9');
    expect(r.catalog).toBeNull();
    expect(r.problems[0]).toMatchObject({ code: 'PLUGIN_TOO_OLD', severity: 'error' });
    expect(r.problems[0].message).toContain('1.2.0');
  });
  it('drops a broken item and keeps the rest', () => {
    const c = catalog();
    delete (c.items[1] as { fit?: string }).fit;
    c.items.push(structuredClone(c.items[0]));
    const r = parseCatalog(c, '0.1.0');
    expect(r.catalog?.items.map((i) => i.id)).toEqual(['LOGO_Shot', 'TTL_LowerThird']);
    expect(r.problems.map((p) => [p.severity, p.detail])).toEqual([['warning', 'T1 without fit'], ['warning', 'duplicate id']]);
  });
  it('filters by host, category, favourites and words in any order, ё as е', () => {
    const c = catalog();
    c.items[1].hosts = ['ae'];
    expect(itemsForHost(c, 'pr').map((i) => i.id)).toEqual(['LOGO_Shot', 'TTL_LowerThird']);
    const items = c.items;
    expect(filterItems(items, { query: 'подписью логошот' }).map((i) => i.id)).toEqual(['LOGO_Shot']);
    expect(filterItems(items, { query: 'ttl' }).map((i) => i.id)).toEqual(['TTL_LowerThird']);
    expect(filterItems(items, { category: 'logo' }).length).toBe(2);
    expect(filterItems(items, { category: 'favorites', favorites: new Set(['LOGO_Mark']) }).map((i) => i.id)).toEqual(['LOGO_Mark']);
    items[0].title_ru = 'Ёлка';
    expect(filterItems(items, { query: 'елка' }).map((i) => i.id)).toEqual(['LOGO_Shot']);
    expect(usedCategories(items).map((c) => c.label_ru)).toEqual(['Логотипы', 'Титры']);
  });
});

describe('variant', () => {
  const ttl = item('TTL_LowerThird');
  it('takes the exact size', () => {
    expect(pickVariant(ttl, { w: 1080, h: 1920 })).toMatchObject({ reason: 'exact', scale: 1, needsConsent: false, variant: { key: '9x16' } });
    expect(pickVariant(ttl, { w: 3840, h: 2160 }).variant?.key).toBe('16x9_4K');
  });
  it('scales the smallest covering variant of the same proportions down', () => {
    const p = pickVariant(ttl, { w: 2560, h: 1440 });
    expect(p).toMatchObject({ reason: 'aspect', needsConsent: true, variant: { key: '16x9_4K' } });
    expect(p.scale).toBeCloseTo(2560 / 3840, 9);
    expect(pickVariant(ttl, { w: 1280, h: 720 }).variant?.key).toBe('16x9');
    expect(pickVariant(ttl, { w: 7680, h: 4320 })).toMatchObject({ variant: { key: '16x9_4K' }, scale: 2 });
  });
  it('offers the closest proportions when the frame has none of its own', () => {
    expect(pickVariant(ttl, { w: 1080, h: 1350 })).toMatchObject({ reason: 'nearest', variant: { key: '1x1' }, scale: 1, needsConsent: true });
    // LOGO_Shot has no 1:1: 16:9 and 9:16 are as far from a square, the first in the catalog wins
    expect(pickVariant(item('LOGO_Shot'), { w: 1080, h: 1080 })).toMatchObject({ reason: 'nearest', variant: { key: '16x9' }, scale: 0.5625 });
  });
  it('lets the manual switch win', () => {
    expect(pickVariant(ttl, { w: 1920, h: 1080 }, {}, '1x1')).toMatchObject({ reason: 'manual', variant: { key: '1x1' }, needsConsent: false });
    expect(pickVariant(ttl, { w: 1920, h: 1080 }, {}, 'nope').reason).toBe('exact');
  });
  it('matches prerender options to the form', () => {
    const it2 = structuredClone(ttl);
    it2.variants = [
      { key: 'a', w: 1920, h: 1080, options: { side: 1 }, minHostVersion: {} },
      { key: 'b', w: 1920, h: 1080, options: { side: 2 }, minHostVersion: {} },
    ];
    expect(pickVariant(it2, { w: 1920, h: 1080 }, { side: 2 }).variant?.key).toBe('b');
    expect(pickVariant(it2, { w: 1920, h: 1080 }, { side: 3 })).toMatchObject({ variant: null, reason: 'none' });
  });
  it('labels a variant for the format chip', () => {
    expect(variantLabel(ttl.variants[0])).toBe('16:9 · 1920×1080 · 25p');
  });
});

describe('fields', () => {
  const ttl = item('TTL_LowerThird');
  const web = webScreen();
  it('gives each field a mode per host', () => {
    const visual = web.fields!.find((f) => f.key === 'visual')!;
    expect(fieldMode(visual, 'ae')).toBe('panel');
    expect(fieldMode(visual, 'pr')).toBe('properties');
    expect(formFields(web, 'pr').map((f) => f.field.key)).not.toContain('duration');
  });
  it('starts from remembered values that still fit, else defaults', () => {
    const v = initialValues(ttl, { name: 'Анна', style: 9, size: 4, gone: 'x' });
    expect(v).toMatchObject({ name: 'Анна', role1: 'Должность', role2: '', style: 1, side: 1, speed: 2, size: 4 });
    expect(v).not.toHaveProperty('gone');
  });
  it('validates values of the fields the panel fills', () => {
    const bad = validateValues(ttl, { ...initialValues(ttl), name: 'Я'.repeat(41), style: 0 }, 'pr');
    expect(bad.map((p) => p.message)).toEqual(['Имя: не длиннее 40 знаков.', 'Стиль: выберите пункт от 1 до 3.']);
  });
  it('converts values the way each host takes them', () => {
    const plate = item('LOGO_Mark').fields![0];
    const style = ttl.fields!.find((f) => f.key === 'style')!;
    expect(hostValue(plate, true, 'ae')).toBe(1);
    expect(hostValue(plate, false, 'pr')).toBe(false);
    expect(hostValue(style, 2, 'pr')).toBe(1);
    expect(hostValue(style, 2, 'ae')).toBe(2);
    expect(hostValue(ttl.fields![0], 'а\r\nб\nв', 'ae')).toBe('а\rб\rв');
  });
  it('writes the panel fields by their Essential Graphics names', () => {
    const w = writesFor(ttl, initialValues(ttl), 'pr');
    expect(w.map((x) => [x.egpName, x.value])).toEqual([
      ['Имя', 'Имя Фамилия'], ['Должность', 'Должность'], ['Должность, 2-я строка', ''],
      ['Стиль', 0], ['Сторона', 0], ['Скорость', 1], ['Размер текста', 1],
    ]);
    const ae = writesFor(web, { ...initialValues(web), visual: 'C:/m/v.mp4' }, 'ae');
    expect(ae.find((x) => x.key === 'visual')).toEqual({ key: 'visual', egpName: 'Визуал', type: 'media', value: 'C:/m/v.mp4' });
    expect(ae.find((x) => x.key === 'qr')).toBeUndefined();
    expect(writesFor(web, initialValues(web), 'pr').map((x) => x.key)).not.toContain('visual');
  });
  it('knows when a field is switched off by its checkbox', () => {
    const minutes = web.fields!.find((f) => f.key === 'minutes')!;
    expect(isActive(minutes, { timer: false })).toBe(false);
    expect(isActive(minutes, { timer: true })).toBe(true);
  });
  it('remembers form values but not media', () => {
    expect(rememberable(web, { title: 'Т', visual: 'C:/a.png', duration: 9 })).toEqual({ title: 'Т' });
  });
});

describe('timing', () => {
  const ttl = item('TTL_LowerThird');
  const web = webScreen();
  it('proposes intro + hold + outro, or the driving field when it is on', () => {
    expect(defaultLengthSec(item('LOGO_Shot'))).toBe(5);
    expect(defaultLengthSec(ttl)).toBe(6);
    expect(defaultLengthSec(web, { timer: false, minutes: 5 })).toBe(35);
    expect(defaultLengthSec(web, { timer: true, minutes: 5 })).toBe(305);
    expect(templateSec(web)).toBe(905);
  });
  it('maps an AE instance with time remap (contract C27)', () => {
    expect(remapKeys(ttl, 10, 25)).toEqual([[0, 0], [2.2, 2.2], [8, 4], [10, 6]]);
    expect(remapKeys(ttl, 6, 25)).toBeNull();
    expect(remapKeys(web, 100, 25)).toBeNull();
  });
  it('rounds to frames of the target and refuses lengths the intro and outro do not fit', () => {
    expect(toFrames(5.013, 25)).toBe(125);
    const p = planLength(ttl, 4.2, {}, 25);
    expect(p.problems.map((x) => x.code)).toEqual(['TOO_SHORT']);
    expect(minLengthSec(ttl, 25)).toBe(4.24);
    expect(planLength(ttl, 4.24, {}, 25).problems).toEqual([]);
    expect(planLength(ttl, null, {}, 30)).toMatchObject({ sec: 6, frames: 180, placeSec: 6, remap: null, serviceDuration: null });
  });
  it('cuts a trim template and writes its service duration', () => {
    const p = planLength(web, null, { timer: true, minutes: 5 }, 25);
    expect(p).toMatchObject({ sec: 305, placeSec: 905, remap: null, serviceDuration: { egpName: 'Длительность (служебное, не менять)', value: 305 } });
    expect(planLength(web, 1000, {}, 25).problems.map((x) => x.code)).toEqual(['TOO_LONG']);
  });
});

describe('paths', () => {
  it('joins with forward slashes', () => {
    expect(joinPath('C:\\Work\\', 'a', 'b.aep')).toBe('C:/Work/a/b.aep');
    expect(joinPath('/Users/Shared', '/x')).toBe('/Users/Shared/x');
    expect(dirname('C:/a/b.aep')).toBe('C:/a');
    expect(basename('C:\\a\\b.aep')).toBe('b.aep');
  });
  it('knows the library and log folders of each OS', () => {
    expect(libraryRoot('win')).toBe('C:/ProgramData/CloudRuBrandKit/library');
    expect(libraryRoot('mac')).toBe('/Users/Shared/CloudRuBrandKit/library');
    expect(logDir('win', { LOCALAPPDATA: 'C:\\Users\\Глеб\\AppData\\Local' })).toBe('C:/Users/Глеб/AppData/Local/CloudRuBrandKit/logs');
    expect(logDir('mac', { HOME: '/Users/g' })).toBe('/Users/g/Library/Logs/CloudRuBrandKit');
  });
  it('puts media of an item next to the project', () => {
    expect(projectAssetDir('D:/Монтаж/ролик.aep', 'LOGO_Shot', 1)).toBe('D:/Монтаж/Cloud.ru BrandKit/LOGO_Shot@1');
  });
  it('refuses a project folder that leaves no room for the MOGRT media on Windows', () => {
    const long = 'C:/' + 'x'.repeat(150) + '/p.prproj';
    expect(projectPathProblem('win', long)?.code).toBe('PATH_TOO_LONG');
    expect(projectPathProblem('mac', long)).toBeNull();
    expect(projectPathProblem('win', 'C:/p/p.prproj')).toBeNull();
  });
});

describe('memory', () => {
  it('remembers values per item, favourites and sound', () => {
    const store = memoryStore();
    const m = new FieldMemory(store);
    const ttl = item('TTL_LowerThird');
    m.save(ttl, { ...m.load(ttl), name: 'Анна' });
    expect(m.load(ttl).name).toBe('Анна');
    expect([...m.toggleFavorite('LOGO_Shot')]).toEqual(['LOGO_Shot']);
    expect([...m.toggleFavorite('LOGO_Shot')]).toEqual([]);
    expect(m.sound()).toEqual({ music: false, sfx: true });
    store.set('brandkit.fields.TTL_LowerThird', '{broken');
    expect(m.load(ttl).name).toBe('Имя Фамилия');
  });
});

describe('checks', () => {
  const ttl = item('TTL_LowerThird');
  it('reads the build of a font', () => {
    expect(fontBuild('Version 1.002;hotconv 1.0.109')).toBe('1.002');
    expect(fontBuild(null)).toBeNull();
  });
  it('refuses a missing or substituted font and warns about another build', () => {
    const p = fontProblems(ttl, {
      'SBSansText-Regular': { found: true, version: '1.003' },
      'SBSansDisplay-Bold': { found: false },
      'SBSansDisplay-Semibold': { found: true, substitute: true },
      'SBSansDisplay-Regular': { found: true, version: 'Version 1.000' },
    });
    expect(p.map((x) => [x.code, x.severity])).toEqual([['NO_FONT', 'error'], ['NO_FONT', 'error'], ['FONT_BUILD', 'warning']]);
  });
  it('warns about colour settings that differ from the build project', () => {
    expect(colorProblems({ workingSpace: 'None', linearize: false, bpc: 16, colorManagement: 'adobe' })).toEqual([]);
    const p = colorProblems({ workingSpace: 'sRGB IEC61966-2.1', linearize: true, bpc: 32, colorManagement: 'OCIO' });
    expect(p[0].message).toBe('Настройки цвета проекта отличаются от эталона (рабочее пространство sRGB IEC61966-2.1, линеаризация, 32 бита, управление цветом OCIO). Цвета шаблона могут измениться.');
  });
});
