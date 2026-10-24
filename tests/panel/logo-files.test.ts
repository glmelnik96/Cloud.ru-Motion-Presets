// The logo as files (LOGO_Files, T3): «Схема» picks the files, the frame picks the PNG the panel places, the SVG of the
// scheme is offered in its folder. The item is the real one of library.src.json.
import { describe, expect, it } from 'vitest';
import { PanelApp, type Services } from '../../panel/src/app/controller';
import type { CallOptions, HostCaller, HostReply } from '../../panel/src/core/host';
import { planItem } from '../../panel/src/core/insert';
import { insertable, mediaKind } from '../../panel/src/core/media';
import { memoryStore } from '../../panel/src/core/memory';
import { libraryFile } from '../../panel/src/core/paths';
import type { Catalog, HostContext } from '../../panel/src/core/types';
import src from '../../library/library.src.json';
import { aeContext, ALL_FONTS, catalog, prContext, toCatalogItem } from './fixtures';

const ROOT = 'C:/ProgramData/CloudRuBrandKit/library';
const logoFiles = () => toCatalogItem(src.items.find((i) => i.id === 'LOGO_Files'));

class Host implements HostCaller {
  constructor(public ctx: HostContext) {}
  async call<T>(fn: string, _args?: unknown, _opts?: CallOptions): Promise<HostReply<T>> {
    if (fn === 'getContext') return { ok: true, data: this.ctx as T };
    if (fn === 'diag') return { ok: true, data: { app: 'Premiere' } as T };
    return { ok: false, error: { code: 'NO_FUNCTION', message: fn } };
  }
}

describe('the logo as files', () => {
  const revealed: string[] = [];
  const make = (ctx: HostContext) => {
    const withFiles = (): Catalog => { const c = catalog(); c.items.push(logoFiles()); return c; };
    return new PanelApp({
      host: new Host(ctx), hostKey: ctx.host, pluginVersion: '0.1.0', platform: 'win', libraryRoot: ROOT,
      readLibrary: async () => JSON.stringify(withFiles()), store: memoryStore(), reveal: (p: string) => revealed.push(p),
      fonts: async (names) => Object.fromEntries(names.map((n) => [n, ALL_FONTS[n] ?? { found: false }])),
    } as Services);
  };

  it('is a still the panel places in both hosts', () => {
    const it = logoFiles();
    expect([insertable(it, 'ae'), insertable(it, 'pr')]).toEqual([true, true]);
    expect(mediaKind(it, it.variants.find((v) => v.key === '9x16_dark')!)).toBe('still');
    expect(mediaKind(it, it.variants.find((v) => v.key === 'svg_dark')!)).toBeNull();
  });

  it('«Схема» picks the PNGs of the format switch and the SVG it offers; the frame picks the PNG', async () => {
    const a = make(prContext());
    await a.init();
    a.open('LOGO_Files');
    const item = a.selected()!;
    expect(a.formatVariants(item).map((v) => v.key)).toEqual(['16x9_dark', '16x9_4K_dark', '9x16_dark', '1x1_dark']);
    expect(a.vectorFile(item)).toBe(libraryFile(ROOT, 'items/LOGO_Files/LOGO_Files_svg_dark_v1.svg'));
    a.setValue('scheme', 3);
    expect(a.pick()?.variant?.key).toBe('16x9_green');
    expect(a.vectorFile(item)).toBe(libraryFile(ROOT, 'items/LOGO_Files/LOGO_Files_svg_green_v1.svg'));
    a.reveal(a.vectorFile(item)!);
    expect(revealed[revealed.length - 1]).toMatch(/LOGO_Files_svg_green_v1\.svg$/);
    // a template has no vector to offer
    a.open('LOGO_Header');
    expect(a.vectorFile(a.selected()!)).toBeNull();
  });

  it('places the PNG of the scheme for the frame: 9:16 and 4K', () => {
    const env = { platform: 'win' as const, libraryRoot: ROOT };
    const vertical = aeContext({ target: { ...aeContext().target!, w: 1080, h: 1920 } });
    const p = planItem({ item: logoFiles(), ctx: vertical, values: { scheme: 2 }, fonts: ALL_FONTS, options: {}, env });
    expect([p.ok, p.media?.variant.key, p.media?.kind]).toEqual([true, '9x16_light', 'still']);
    const uhd = prContext({ target: { ...prContext().target!, w: 3840, h: 2160 } });
    const q = planItem({ item: logoFiles(), ctx: uhd, values: { scheme: 4 }, fonts: ALL_FONTS, options: {}, env });
    expect([q.media?.variant.key, q.media?.lengthSec]).toEqual(['16x9_4K_mono', 10]);
  });
});
