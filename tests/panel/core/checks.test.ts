import { describe, it, expect } from 'vitest';
import { preflight, mogrtMediaPathLength, needsProjectFolder, MAX_PATH, type PreflightInput } from '../../../panel/src/core/checks';
import { chooseVariant } from '../../../panel/src/core/variant';
import { defaults } from '../../../panel/src/core/fields';
import { defaultLen } from '../../../panel/src/core/duration';
import { message } from '../../../panel/src/core/errors';
import type { Item } from '../../../panel/src/core/types';
import { aeCtx, fontsFor, item, prCtx } from './fixture';

// A ready insert of `id` (TTL by default) in Premiere, with the given parts replaced.
function check(over: Partial<PreflightInput> & { id?: string; manual?: string } = {}) {
  const it = over.item ?? item(over.id ?? 'TTL_LowerThird');
  const ctx = over.ctx ?? prCtx();
  return preflight({
    ctx,
    item: it,
    choice: over.choice ?? chooseVariant(it, ctx.target, over.manual),
    values: over.values ?? defaults(it),
    lenSec: over.lenSec ?? defaultLen(it),
    fonts: over.fonts !== undefined ? over.fonts : fontsFor(it),
    pluginVersion: over.pluginVersion ?? '0.1.0',
    minPluginVersion: over.minPluginVersion,
  });
}
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('preflight: a ready insert', () => {
  it('has no issues for every pack-1 item in both hosts', () => {
    for (const id of ['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']) {
      expect(check({ id })).toEqual([]);
      expect(check({ id, ctx: aeCtx() })).toEqual([]);
    }
  });
});

describe('preflight: refusals', () => {
  it('NO_TARGET without an active comp or sequence (and no NO_VARIANT on top)', () => {
    expect(check({ ctx: prCtx(null) })).toEqual([{ code: 'NO_TARGET', level: 'error' }]);
    expect(check({ ctx: aeCtx(null) })).toEqual([{ code: 'NO_TARGET', level: 'error' }]);
  });
  it('HOST_TOO_OLD when the variant needs a newer host', () => {
    const ttl = item('TTL_LowerThird');
    for (const v of ttl.variants) v.minHostVersion = { ae: '27.0', pr: '26.5.3' };
    expect(check({ item: ttl })).toEqual([{ code: 'HOST_TOO_OLD', level: 'error', params: { need: '26.5.3', have: '26.5.2' } }]);
    expect(check({ item: ttl, ctx: aeCtx() })).toEqual([{ code: 'HOST_TOO_OLD', level: 'error', params: { need: '27.0', have: '26.5' } }]);
    expect(check({ item: ttl, ctx: { ...prCtx(), hostVersion: '26.5.3' } })).toEqual([]);
  });
  it('NO_VARIANT with the frame and the nearest variant (P1)', () => {
    const issues = check({ id: 'LOGO_Shot', ctx: prCtx({ w: 2560, h: 1440 }) });
    expect(issues).toEqual([{ code: 'NO_VARIANT', level: 'error', params: { frame: '2560×1440', nearest: '16x9' } }]);
    expect(message(issues[0]!)).toBe('Нет варианта под кадр 2560×1440. Ближайший — 16x9, его можно выбрать вручную в чипе формата.');
  });
  it('lets a manually chosen variant through', () => {
    expect(check({ id: 'LOGO_Shot', ctx: prCtx({ w: 2560, h: 1440 }), manual: '16x9' })).toEqual([]);
  });
  it('FONT_MISSING for a font that is absent, substituted or not reported', () => {
    const ttl = item('TTL_LowerThird');
    const fonts = fontsFor(ttl, { 'SBSansDisplay-Bold': { found: false, build: null }, 'SBSansDisplay-Regular': { substitute: true } })
      .filter((f) => f.postScriptName !== 'SBSansText-Regular');
    expect(check({ item: ttl, fonts })).toEqual([
      { code: 'FONT_MISSING', level: 'error', params: { font: 'SBSansText-Regular' } },
      { code: 'FONT_MISSING', level: 'error', params: { font: 'SBSansDisplay-Bold' } },
      { code: 'FONT_MISSING', level: 'error', params: { font: 'SBSansDisplay-Regular' } },
    ]);
  });
  it('FONT_CHECK_FAILED when the font check did not run: unknown is not "not installed"', () => {
    expect(check({ fonts: null })).toEqual([{ code: 'FONT_CHECK_FAILED', level: 'error' }]);
    expect(check({ id: 'LOGO_Mark', fonts: null })).toEqual([]); // no required fonts
    // a JS caller that leaves fonts out gets the same
    const ttl = item('TTL_LowerThird');
    const input = { ctx: prCtx(), item: ttl, choice: chooseVariant(ttl, prCtx().target), values: defaults(ttl), lenSec: 6, pluginVersion: '0.1.0' };
    expect(preflight(input as unknown as PreflightInput)).toEqual([{ code: 'FONT_CHECK_FAILED', level: 'error' }]);
  });
  it('counts a required font the check did not report as missing', () => {
    expect(codes(check({ fonts: [] }))).toEqual(['FONT_MISSING', 'FONT_MISSING', 'FONT_MISSING', 'FONT_MISSING']);
  });
  it('matches a font status by PostScript name in any case', () => {
    const shot = item('LOGO_Shot');
    const fonts = [{ postScriptName: 'SBSANSDISPLAY-SEMIBOLD', found: true, build: '1.002', substitute: false }];
    expect(check({ item: shot, fonts })).toEqual([]);
  });
  it('LENGTH_TOO_SHORT below intro + outro (P3)', () => {
    expect(check({ lenSec: 4.2 })).toEqual([]);
    expect(check({ lenSec: 4.16 })).toEqual([{ code: 'LENGTH_TOO_SHORT', level: 'error', params: { min: 4.2 } }]);
    expect(check({ id: 'LOGO_Shot', lenSec: 4.24 })).toEqual([]);
    expect(check({ id: 'LOGO_Shot', lenSec: 4.2 })).toEqual([{ code: 'LENGTH_TOO_SHORT', level: 'error', params: { min: 4.24 } }]);
    for (const bad of [0, -1, Number.NaN]) expect(codes(check({ lenSec: bad }))).toEqual(['LENGTH_TOO_SHORT']);
    expect(check({ lenSec: 600 })).toEqual([]);
  });
  it('LENGTH_TOO_SHORT: a microsecond under the minimum is rounding noise, a little more is not', () => {
    expect(check({ lenSec: 4.2 - 5e-7 })).toEqual([]);
    expect(check({ lenSec: 4.2 - 2e-6 })).toEqual([{ code: 'LENGTH_TOO_SHORT', level: 'error', params: { min: 4.2 } }]);
  });
  it('LENGTH_TOO_SHORT for no length at all, even where the item has no minimum', () => {
    const loose: Item = { ...item('LOGO_Mark'), tier: 'T3' };
    delete loose.duration;
    expect(codes(check({ item: loose, lenSec: 0 }))).toEqual(['LENGTH_TOO_SHORT']);
    expect(check({ item: loose, lenSec: 0.5 })).toEqual([]);
  });
  it('PROJECT_NOT_SAVED: always in Premiere, in AE only when the item needs a folder next to the project', () => {
    const unsaved = { path: null, saved: false };
    expect(check({ ctx: prCtx({}, unsaved) })).toEqual([{ code: 'PROJECT_NOT_SAVED', level: 'error' }]);
    expect(check({ ctx: aeCtx({}, unsaved) })).toEqual([]);
    const withMedia: Item = { ...item('TTL_LowerThird') };
    withMedia.fields = [...(withMedia.fields ?? []), { key: 'photo', label_ru: 'Фото', type: 'media', egpName: 'Фото', egpIndex: 7 }];
    expect(check({ item: withMedia, ctx: aeCtx({}, unsaved) })).toEqual([{ code: 'PROJECT_NOT_SAVED', level: 'error' }]);
    expect(check({ ctx: prCtx({}, { path: '', saved: false }) })).toEqual([{ code: 'PROJECT_NOT_SAVED', level: 'error' }]);
  });
  it('knows which items need a project folder', () => {
    expect(['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird'].map((id) => needsProjectFolder(item(id)))).toEqual([false, false, false]);
    expect(needsProjectFolder({ ...item('LOGO_Mark'), tier: 'T2' })).toBe(true);
    expect(needsProjectFolder({ ...item('LOGO_Mark'), tier: 'T3' })).toBe(true);
    const withCompanion = { ...item('LOGO_Mark'), companions: [{ ref: 'SFX_WhooshIn', kind: 'sfx', placement: 'in', default: true }] };
    expect(needsProjectFolder(withCompanion)).toBe(true);
    const withNone = { ...item('LOGO_Mark'), companions: [] };
    expect(needsProjectFolder(withNone)).toBe(false); // none is none
  });
  it('measures the path where Premiere unpacks a MOGRT', () => {
    // <dir>\Motion Graphics Template Media\<36-char capsule GUID>\<template>.aegraphic
    expect(mogrtMediaPathLength('C:\\Проекты\\Ролик.prproj', 'TTL_LowerThird_16x9_v1')).toBe(10 + 1 + 30 + 1 + 36 + 1 + 22 + 10);
    expect(mogrtMediaPathLength('C:/Проекты/Ролик.prproj', 'TTL_LowerThird_16x9_v1')).toBe(111);
    expect(MAX_PATH).toBe(259);
  });
  it('PATH_TOO_LONG in Premiere past 259 characters, never in AE', () => {
    const head = 'C:\\Проекты\\';
    const project = (dirLen: number) => ({ path: head + 'я'.repeat(dirLen - head.length) + '\\Монтаж.prproj', saved: true });
    expect(check({ ctx: prCtx({}, project(158)) })).toEqual([]);
    expect(check({ ctx: prCtx({}, project(159)) })).toEqual([{ code: 'PATH_TOO_LONG', level: 'error', params: { length: 260, max: 259 } }]);
    expect(check({ ctx: aeCtx({}, project(300)) })).toEqual([]);
  });
  it('PLUGIN_TOO_OLD when the caller passes the library minimum', () => {
    expect(check({ minPluginVersion: '0.1.0' })).toEqual([]);
    expect(check({ minPluginVersion: '0.2.0' })).toEqual([
      { code: 'PLUGIN_TOO_OLD', level: 'error', params: { need: '0.2.0', have: '0.1.0' } },
    ]);
  });
  it('passes field issues through', () => {
    const ttl = item('TTL_LowerThird');
    expect(check({ item: ttl, values: { ...defaults(ttl), role2: 'Ё'.repeat(51) } })).toEqual([
      { code: 'FIELD_TOO_LONG', level: 'error', params: { field: 'Должность, 2-я строка', key: 'role2', max: 50, len: 51 } },
    ]);
  });
});

describe('preflight: warnings', () => {
  it('FONT_BUILD when a font is found with another build', () => {
    const ttl = item('TTL_LowerThird');
    const fonts = fontsFor(ttl, { 'SBSansText-Regular': { build: '1.002' }, 'SBSansDisplay-Bold': { build: null } });
    expect(check({ item: ttl, fonts })).toEqual([
      { code: 'FONT_BUILD', level: 'warning', params: { font: 'SBSansText-Regular', need: '1.003', have: '1.002' } },
      { code: 'FONT_BUILD', level: 'warning', params: { font: 'SBSansDisplay-Bold', need: '1.002', have: '?' } },
    ]);
  });
  it('FPS_MISMATCH when the target fps differs at 3 decimals (P2)', () => {
    expect(check({ ctx: prCtx({ fps: 30 }) })).toEqual([{ code: 'FPS_MISMATCH', level: 'warning', params: { template: 25, target: 30 } }]);
    expect(check({ ctx: aeCtx({ fps: 25.0004 }) })).toEqual([]);
    expect(check({ ctx: aeCtx({ fps: 25.004 }) })).toEqual([{ code: 'FPS_MISMATCH', level: 'warning', params: { template: 25, target: 25.004 } }]);
    const thirty = item('TTL_LowerThird');
    for (const v of thirty.variants) v.fps = 30;
    expect(check({ item: thirty, ctx: prCtx({ fps: 29.9996 }) })).toEqual([]); // rounded to 30.000, not cut to 29.999
    const ntsc = item('TTL_LowerThird');
    for (const v of ntsc.variants) v.fps = 29.97;
    expect(check({ item: ntsc, ctx: prCtx({ fps: 254016000000 / 8475667200 }) })).toEqual([]); // 29.97003 from the timebase
    expect(message(check({ ctx: prCtx({ fps: 29.97 }) })[0]!)).toContain('29,97');
  });
});

describe('preflight: everything at once', () => {
  it('lists all issues, errors first, each with a filled message', () => {
    const ttl = item('TTL_LowerThird');
    const issues = check({
      item: ttl,
      ctx: prCtx({ w: 2560, h: 1440, fps: 30 }, { path: null, saved: false }),
      fonts: fontsFor(ttl, { 'SBSansText-Regular': { build: '1.002' }, 'SBSansDisplay-Bold': { found: false } }),
      lenSec: 1,
      values: { ...defaults(ttl), name: 'Константин Константинопольский-Щедрин-Ёлкин' },
    });
    expect(codes(issues)).toEqual(['NO_VARIANT', 'PROJECT_NOT_SAVED', 'FONT_MISSING', 'LENGTH_TOO_SHORT', 'FIELD_TOO_LONG', 'FONT_BUILD']);
    for (const i of issues) expect(message(i)).not.toMatch(/[{}[\]]/);
  });
});
