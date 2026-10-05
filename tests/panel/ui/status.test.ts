import { describe, it, expect } from 'vitest';
import { hostLabel, requiredFonts, statusBar, summarizeFonts } from '../../../panel/src/ui/status';
import type { FontStatus } from '../../../panel/src/core/types';
import { catalog, fontsFor, item } from '../core/fixture';

const TTL = item('TTL_LowerThird');
const MARK = item('LOGO_Mark');
const REQUIRED = TTL.requiredFonts!;
const status = (name: string, over: Partial<FontStatus> = {}): FontStatus => ({
  postScriptName: name, found: true, build: '1.002', substitute: false, ...over,
});

describe('hostLabel', () => {
  it('names the host and its version the way the About box does', () => {
    expect(hostLabel('ae', '26.5x89')).toBe('After Effects 26.5');
    expect(hostLabel('pr', '26.5.2')).toBe('Premiere Pro 26.5.2');
    expect(hostLabel('ae', '26.0')).toBe('After Effects 26.0');
    expect(hostLabel('pr', '26.5.0')).toBe('Premiere Pro 26.5');
  });

  it('names the host alone when the version is not known', () => {
    expect(hostLabel('ae', null)).toBe('After Effects');
    expect(hostLabel('pr', undefined)).toBe('Premiere Pro');
    expect(hostLabel('pr', 'unreadable')).toBe('Premiere Pro');
  });
});

describe('summarizeFonts', () => {
  it('says the fonts are in order when every required font is found in its build', () => {
    expect(summarizeFonts(REQUIRED, fontsFor(TTL))).toEqual({ tone: 'ok', text: 'Шрифты: в порядке', missing: [] });
  });

  it('lists the fonts that are not installed', () => {
    const statuses = [
      status('SBSansText-Regular', { build: '1.003' }),
      status('SBSansDisplay-Bold', { found: false, build: null }),
      status('SBSansDisplay-Semibold'),
      status('SBSansDisplay-Regular'),
    ];
    expect(summarizeFonts(REQUIRED, statuses)).toEqual({
      tone: 'error', text: 'Нет шрифтов: SBSansDisplay-Bold', missing: ['SBSansDisplay-Bold'],
    });
  });

  it('counts a font the check did not report, and a substitute, as missing', () => {
    const statuses = [status('SBSansText-Regular', { build: '1.003' }), status('SBSansDisplay-Semibold', { substitute: true })];
    const r = summarizeFonts(REQUIRED, statuses);
    expect(r.tone).toBe('error');
    expect(r.missing).toEqual(['SBSansDisplay-Bold', 'SBSansDisplay-Semibold', 'SBSansDisplay-Regular']);
    expect(r.text).toBe('Нет шрифтов: SBSansDisplay-Bold, SBSansDisplay-Semibold, SBSansDisplay-Regular');
  });

  it('warns about another build of a font that is there', () => {
    const statuses = fontsFor(TTL, { 'SBSansDisplay-Bold': { build: '1.001' } });
    expect(summarizeFonts(REQUIRED, statuses)).toEqual({
      tone: 'warn', text: 'Шрифты: другая сборка у SBSansDisplay-Bold', missing: [],
    });
  });

  it('puts a missing font before a different build', () => {
    const statuses = fontsFor(TTL, { 'SBSansDisplay-Bold': { build: '1.001' }, 'SBSansDisplay-Regular': { found: false, build: null } });
    expect(summarizeFonts(REQUIRED, statuses).tone).toBe('error');
  });

  it('matches a PostScript name without regard to case, as the core does', () => {
    const statuses = fontsFor(TTL).map((s) => ({ ...s, postScriptName: s.postScriptName.toLowerCase() }));
    expect(summarizeFonts(REQUIRED, statuses).tone).toBe('ok');
  });

  it('says nothing is to be checked when the library needs no font', () => {
    expect(summarizeFonts(MARK.requiredFonts ?? [], [])).toEqual({ tone: 'ok', text: 'Шрифты: проверка не нужна', missing: [] });
  });

  it('says the check did not run or did not finish', () => {
    expect(summarizeFonts(REQUIRED, null)).toEqual({ tone: 'warn', text: 'Шрифты: проверить не удалось', missing: [] });
    expect(summarizeFonts(REQUIRED, undefined)).toEqual({ tone: 'muted', text: 'Шрифты: проверяются…', missing: [] });
  });

  it('counts a font once even when several items need it', () => {
    const twice = [...REQUIRED, ...REQUIRED];
    const r = summarizeFonts(twice, [status('SBSansText-Regular', { found: false, build: null })]);
    expect(r.missing).toEqual(['SBSansText-Regular', 'SBSansDisplay-Bold', 'SBSansDisplay-Semibold', 'SBSansDisplay-Regular']);
  });
});

describe('statusBar', () => {
  const fonts = summarizeFonts(REQUIRED, fontsFor(TTL));

  it('has the host and its version, the panel and the library versions, and the fonts', () => {
    expect(statusBar({ host: 'pr', hostVersion: '26.5.2', plugin: '0.1.0', library: '2026.10.05.1', fonts })).toEqual({
      host: 'Premiere Pro 26.5.2',
      panel: 'Панель 0.1.0',
      library: 'Библиотека 2026.10.05.1',
      fonts: { tone: 'ok', text: 'Шрифты: в порядке', missing: [] },
    });
  });

  it('says the library is not loaded', () => {
    expect(statusBar({ host: 'ae', hostVersion: '26.5x89', plugin: '0.1.0', library: null, fonts }).library).toBe('Библиотека не загружена');
    expect(statusBar({ host: 'ae', hostVersion: '26.5x89', plugin: '0.1.0', library: undefined, fonts }).library).toBe('Библиотека не загружена');
  });

  it('has no fonts line when there is no library to need any', () => {
    expect(statusBar({ host: 'pr', hostVersion: '26.5.2', plugin: '0.1.0', library: null, fonts: null }).fonts).toBeNull();
  });

  it('carries the missing fonts through', () => {
    const bad = summarizeFonts(REQUIRED, []);
    expect(statusBar({ host: 'ae', hostVersion: null, plugin: '0.1.0', library: '2026.10.05.1', fonts: bad }).fonts?.tone).toBe('error');
  });
});

describe('requiredFonts', () => {
  it('lists the fonts the items need, each once, in the order the items meet them', () => {
    expect(requiredFonts(catalog().items)).toEqual([
      { postScriptName: 'SBSansDisplay-Semibold', build: '1.002' },
      { postScriptName: 'SBSansText-Regular', build: '1.003' },
      { postScriptName: 'SBSansDisplay-Bold', build: '1.002' },
      { postScriptName: 'SBSansDisplay-Regular', build: '1.002' },
    ]);
  });

  it('is empty for items that need no font, and for none', () => {
    expect(requiredFonts([MARK])).toEqual([]);
    expect(requiredFonts([])).toEqual([]);
  });
});
