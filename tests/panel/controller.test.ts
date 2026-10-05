import { describe, expect, it } from 'vitest';
import { PanelApp, type Services } from '../../panel/src/app/controller';
import type { CallOptions, HostCaller, HostReply } from '../../panel/src/core/host';
import type { InsertRequest } from '../../panel/src/core/insert';
import { memoryStore } from '../../panel/src/core/memory';
import type { HostContext } from '../../panel/src/core/types';
import { ALL_FONTS, catalog, prContext } from './fixtures';

class Host implements HostCaller {
  calls: string[] = [];
  requests: InsertRequest[] = [];
  constructor(public ctx: HostContext | null, public readback: (r: InsertRequest) => Record<string, unknown> = (r) => Object.fromEntries(r.writes.map((w) => [w.egpName, w.value]))) {}
  async call<T>(fn: string, args?: unknown, _opts?: CallOptions): Promise<HostReply<T>> {
    this.calls.push(fn);
    if (fn === 'getContext') return { ok: true, data: this.ctx as T };
    if (fn === 'diag') return { ok: true, data: { app: 'Premiere' } as T };
    if (fn === 'insertItem') {
      const r = args as InsertRequest;
      this.requests.push(r);
      return { ok: true, data: { name: 'x', startSec: r.startSec, lengthSec: r.lengthSec, readback: this.readback(r) } as T };
    }
    return { ok: false, error: { code: 'NO_FUNCTION', message: fn } };
  }
}

function app(host: Host, over: Partial<Services> = {}) {
  const store = memoryStore();
  const svc: Services = {
    host,
    hostKey: 'pr',
    pluginVersion: '0.1.0',
    platform: 'win',
    libraryRoot: 'C:/ProgramData/CloudRuBrandKit/library',
    readLibrary: async () => JSON.stringify(catalog()),
    store,
    fonts: async (names) => Object.fromEntries(names.map((n) => [n, ALL_FONTS[n] ?? { found: false }])),
    ...over,
  };
  return { a: new PanelApp(svc), store };
}

describe('panel app', () => {
  it('starts: library, context, fonts', async () => {
    const { a } = app(new Host(prContext()));
    await a.init();
    expect(a.state.phase).toBe('ready');
    expect(a.state.items.map((i) => i.id)).toEqual(['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird']);
    expect(a.categories().map((c) => c.label_ru)).toEqual(['Избранное', 'Логотипы', 'Титры']);
    expect(a.fontSummary()).toEqual({ ok: true, text: 'Шрифты SB Sans на месте' });
    expect(a.versions()).toBe('Pr 26.5.2 · панель 0.1.0 · библиотека 2026.10.05');
    expect(a.formatChip()).toBe('Авто 1920×1080 · 25p');
  });

  it('shows a clear error without a library or with a newer one', async () => {
    const { a } = app(new Host(prContext()), { readLibrary: async () => null });
    await a.init();
    expect(a.state.phase).toBe('error');
    expect(a.state.libraryProblems[0].message).toContain('library.json');
    const { a: b } = app(new Host(prContext()), { pluginVersion: '0.0.1' });
    await b.init();
    expect(b.state.libraryProblems[0].code).toBe('PLUGIN_TOO_OLD');
  });

  it('filters the catalog and keeps favourites', async () => {
    const { a, store } = app(new Host(prContext()));
    await a.init();
    a.setQuery('логотип');
    expect(a.visibleItems().map((i) => i.id)).toEqual(['LOGO_Mark']);
    a.setQuery('');
    a.toggleFavorite('TTL_LowerThird');
    a.setCategory('favorites');
    expect(a.visibleItems().map((i) => i.id)).toEqual(['TTL_LowerThird']);
    a.setCategory('favorites');
    expect(a.state.category).toBeNull();
    expect(store.get('brandkit.favorites')).toBe('["TTL_LowerThird"]');
  });

  it('opens a form with remembered values and plans as the user types', async () => {
    const { a } = app(new Host(prContext()));
    await a.init();
    a.open('TTL_LowerThird');
    expect(a.state.view).toBe('form');
    expect(a.formatChip()).toBe('Авто 16:9 · 1920×1080 · 25p');
    expect(a.fields(a.selected()!).map((f) => f.field.key)).toEqual(['name', 'role1', 'role2', 'style', 'side', 'speed', 'size']);
    a.setValue('name', 'Я'.repeat(41));
    expect(a.state.plan?.problems.map((p) => p.code)).toEqual(['BAD_VALUE']);
    a.setValue('name', 'Анна');
    a.setLength(10);
    expect(a.state.plan?.request?.lengthSec).toBe(10);
    expect(a.lengthFor(a.selected()!)).toBe(10);
    a.setLength(null);
    expect(a.lengthFor(a.selected()!)).toBe(6);
    a.setVariant('1x1');
    expect(a.formatChip()).toBe('Вручную 1:1 · 1080×1080 · 25p');
  });

  it('inserts with a fresh context, remembers the values, logs the outcome', async () => {
    const host = new Host(prContext());
    const { a } = app(host);
    await a.init();
    a.open('TTL_LowerThird');
    a.setValue('name', 'Анна');
    host.ctx = prContext({ target: { ...prContext().target!, timeSec: 77 } });
    const out = await a.insert();
    expect(out.ok).toBe(true);
    expect(host.requests[0].startSec).toBe(77);
    expect(a.state.busy).toBe(false);
    a.back();
    a.open('TTL_LowerThird');
    expect(a.state.values.name).toBe('Анна');
  });

  it('asks for consent to the nearest variant and inserts it after the yes', async () => {
    const host = new Host(prContext({ target: { ...prContext().target!, w: 2560, h: 1440 } }));
    const { a } = app(host);
    await a.init();
    a.open('TTL_LowerThird');
    expect(a.state.plan?.problems.map((p) => p.code)).toEqual(['NEAREST_VARIANT']);
    const first = await a.insert();
    expect(first.ok).toBe(false);
    expect(a.state.consent).toEqual({ key: '16x9_4K', label: '16:9 · 3840×2160 · 25p' });
    expect(host.requests).toHaveLength(0);
    const second = await a.insert(true);
    expect(second.ok).toBe(true);
    expect(host.requests[0].scale).toBe(0.666667);
    expect(a.state.consent).toBeNull();
  });

  it('reports fields that did not read back and keeps the values unremembered', async () => {
    const host = new Host(prContext(), (r) => ({ ...Object.fromEntries(r.writes.map((w) => [w.egpName, w.value])), 'Имя': 'старое' }));
    const { a, store } = app(host);
    await a.init();
    a.open('TTL_LowerThird');
    a.setValue('name', 'Анна');
    const out = await a.insert();
    expect(out.ok).toBe(false);
    expect(a.state.outcome?.problems[0].message).toMatch(/^Не записались поля: Имя\./);
    expect(store.get('brandkit.fields.TTL_LowerThird')).toBeNull();
  });

  it('refuses without an active sequence', async () => {
    const { a } = app(new Host(null));
    await a.init();
    a.open('LOGO_Shot');
    expect(a.formatChip()).toBe('Нет секвенции');
    const out = await a.insert();
    expect(out.problems[0]).toMatchObject({ code: 'NO_TARGET', message: 'Нет активной секвенции. Откройте секвенцию на таймлайне и повторите.' });
  });

  it('copies a diagnostic report', async () => {
    const { a } = app(new Host(prContext()));
    await a.init();
    const d = JSON.parse(await a.diagnostics());
    expect(d).toMatchObject({ plugin: '0.1.0', libraryVersion: '2026.10.05', host: { app: 'Premiere' } });
  });
});
