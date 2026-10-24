// The 4K files as an installer option (D24): the panel leaves out the variants of a pack this install lacks, picks the
// nearest one with consent, and says under it that the installer with the option adds the 4K files.
import { describe, expect, it } from 'vitest';
import { PanelApp, type Services } from '../../panel/src/app/controller';
import type { CallOptions, HostCaller, HostReply } from '../../panel/src/core/host';
import { installedOnly } from '../../panel/src/core/library';
import { memoryStore } from '../../panel/src/core/memory';
import { messages } from '../../panel/src/core/problems';
import type { HostContext } from '../../panel/src/core/types';
import { ALL_FONTS, exampleCatalog, prContext } from './fixtures';

const ROOT = 'C:/ProgramData/CloudRuBrandKit/library';
const no4k = (p: string) => !/_16x9_4K_/.test(p);

class Host implements HostCaller {
  constructor(public ctx: HostContext) {}
  async call<T>(fn: string, _args?: unknown, _opts?: CallOptions): Promise<HostReply<T>> {
    if (fn === 'getContext') return { ok: true, data: this.ctx as T };
    if (fn === 'diag') return { ok: true, data: { app: 'Premiere' } as T };
    return { ok: false, error: { code: 'NO_FUNCTION', message: fn } };
  }
}

describe('an installer option of 4K files', () => {
  it('leaves out the variants of a pack whose files are not there, and keeps the option the item lost', () => {
    const cat = exampleCatalog();
    const out = installedOnly(cat, ROOT, no4k);
    const portal = out.items.find((i) => i.id === 'BG_WebinarPortal')!;
    expect(portal.variants.map((v) => v.key)).toEqual(['16x9']);
    expect(portal.packsMissing).toEqual(['4k']);
    // a variant without a pack stays whatever the disk says: the installer checks the base install
    expect(out.items.find((i) => i.id === 'TTL_LowerThird')!.variants.map((v) => v.key)).toContain('16x9_4K');
    expect(out.items.find((i) => i.id === 'TTL_LowerThird')!.packsMissing).toBeUndefined();
    // with the option installed nothing changes
    const all = installedOnly(cat, ROOT, () => true);
    expect(all.items.find((i) => i.id === 'BG_WebinarPortal')!.variants.map((v) => v.key)).toEqual(['16x9', '16x9_4K']);
    expect(all.items.find((i) => i.id === 'BG_WebinarPortal')!.packsMissing).toBeUndefined();
  });

  it('in a 4K sequence offers the FHD loop with consent and says where the 4K one comes from', async () => {
    const make = (ctx: HostContext, fileExists?: (p: string) => boolean) => new PanelApp({
      host: new Host(ctx), hostKey: 'pr', pluginVersion: '0.1.0', platform: 'win', libraryRoot: ROOT,
      readLibrary: async () => JSON.stringify(exampleCatalog()), store: memoryStore(), fileExists,
      fonts: async (names) => Object.fromEntries(names.map((n) => [n, ALL_FONTS[n] ?? { found: false }])),
    } as Services);
    const uhd = prContext({ target: { ...prContext().target!, w: 3840, h: 2160 } });
    const a = make(uhd, no4k);
    await a.init();
    a.open('BG_WebinarPortal');
    const item = a.selected()!;
    expect(a.formatVariants(item).map((v) => v.key)).toEqual(['16x9']);
    expect([a.pick()?.variant?.key, a.pick()?.needsConsent]).toEqual(['16x9', true]);
    expect(a.packHint(item)).toBe(messages.pack4k());
    // an FHD sequence needs no 4K file: no hint
    const b = make(prContext(), no4k);
    await b.init();
    b.open('BG_WebinarPortal');
    expect(b.packHint(b.selected()!)).toBeNull();
    // installed: the 4K loop is picked, nothing to say
    const c = make(uhd, () => true);
    await c.init();
    c.open('BG_WebinarPortal');
    expect([c.pick()?.variant?.key, c.packHint(c.selected()!)]).toEqual(['16x9_4K', null]);
  });
});
