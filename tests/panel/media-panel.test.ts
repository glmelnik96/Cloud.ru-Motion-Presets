// The panel side of T2/T3 inserts: the controller flow — getCuts, files next to the project, insertMedia or
// insertItem with companions. The file copies and the backdrop still are in files.test.mjs.
import { describe, expect, it } from 'vitest';
import { PanelApp, type Services } from '../../panel/src/app/controller';
import type { CallOptions, HostCaller, HostReply } from '../../panel/src/core/host';
import type { InsertRequest, MediaRequest } from '../../panel/src/core/insert';
import { memoryStore } from '../../panel/src/core/memory';
import type { HostContext } from '../../panel/src/core/types';
import { ALL_FONTS, aeContext, exampleCatalog, prContext } from './fixtures';

class Host implements HostCaller {
  calls: string[] = [];
  media: MediaRequest[] = [];
  items: InsertRequest[] = [];
  constructor(public ctx: HostContext) {}
  async call<T>(fn: string, args?: unknown, _opts?: CallOptions): Promise<HostReply<T>> {
    this.calls.push(fn);
    if (fn === 'getContext') return { ok: true, data: this.ctx as T };
    if (fn === 'getCuts') return { ok: true, data: { cuts: [this.ctx.target!.timeSec - 0.4] } as T };
    if (fn === 'insertMedia') {
      const r = args as MediaRequest;
      this.media.push(r);
      const l = r.layout;
      const placed = [...l.video, ...(l.backdrop ? [{ role: 'backdrop', startSec: l.backdrop.startSec, lengthSec: l.backdrop.lengthSec }] : []), ...l.audio]
        .map((p) => ({ role: p.role, name: 'x', startSec: p.startSec ?? 0, lengthSec: p.lengthSec ?? 1 }));
      return { ok: true, data: { name: 'x', startSec: r.startSec, lengthSec: r.lengthSec ?? 1, placed, imported: placed.length } as T };
    }
    if (fn === 'insertItem') {
      const r = args as InsertRequest;
      this.items.push(r);
      const companions = r.companions ? [...r.companions.video, ...r.companions.audio].map((p) => ({ role: p.role, name: 'x', startSec: p.startSec ?? 0, lengthSec: p.lengthSec ?? 1 })) : [];
      return { ok: true, data: { name: 'x', startSec: r.startSec, lengthSec: r.lengthSec, readback: Object.fromEntries(r.writes.map((w) => [w.egpName, w.value])), companions } as T };
    }
    return { ok: false, error: { code: 'NO_FUNCTION', message: fn } };
  }
}

function app(host: Host, over: Partial<Services> = {}) {
  const prepared: string[][] = [];
  const svc: Services = {
    host,
    hostKey: host.ctx.host,
    pluginVersion: '0.1.15',
    platform: 'win',
    libraryRoot: 'C:/ProgramData/CloudRuBrandKit/library',
    readLibrary: async () => JSON.stringify(exampleCatalog()),
    store: memoryStore(),
    fonts: async (names) => Object.fromEntries(names.map((n) => [n, ALL_FONTS[n] ?? { found: true }])),
    prepareFiles: async (p) => {
      prepared.push([...p.copies.map((c) => c.to.split('/').pop()!), ...p.solids.map((s) => s.path.split('/').pop()!)]);
      return { copied: p.copies.map((c) => c.to), reused: [], written: p.solids.map((s) => s.path) };
    },
    ...over,
  };
  return { a: new PanelApp(svc), prepared };
}

describe('panel app: T2/T3', () => {
  it('shows the files the panel places and hides the SVG twin in the format switch', async () => {
    const { a } = app(new Host(prContext()));
    await a.init();
    expect(a.state.items.map((i) => i.id)).toEqual(['TTL_LowerThird', 'SFX_WhooshIn', 'WEB_Screen', 'BG_WebinarPortal', 'TRN_StepWipe', 'BG_Arrows', 'BG_DotGrid', 'SFX_WebinarBed']);
    const dots = a.state.items.find((i) => i.id === 'BG_DotGrid')!;
    expect(a.formatVariants(dots).map((v) => v.key)).toEqual(['16x9']);
  });

  it('a background loop: length and backdrop in the form, files first, then insertMedia', async () => {
    const host = new Host(prContext({ target: { ...prContext().target!, rangeEndSec: 70 } }));
    const { a, prepared } = app(host);
    await a.init();
    a.open('BG_Arrows');
    const item = a.selected()!;
    expect([a.lengthEditable(item), a.backdropOffered(item), a.backdropOn(item), a.lengthFor(item)]).toEqual([true, true, true, 30]);
    const out = await a.insert();
    expect(out).toMatchObject({ ok: true, problems: [] });
    expect(prepared).toEqual([['BG_Arrows_16x9_intro_v1.mov', 'BG_Arrows_16x9_loop_v1.mov', 'BG_Arrows_16x9_outro_v1.mov', 'backdrop_222222_1920x1080.png']]);
    expect(host.calls.filter((c) => c !== 'getContext')).toEqual(['insertMedia']);
    a.setBackdrop(false);
    await a.insert();
    expect(host.media[1].layout.backdrop).toBeNull();
  });

  it('a transition in Premiere asks for the cuts first and keeps its own length', async () => {
    const host = new Host(prContext());
    const { a } = app(host);
    await a.init();
    a.open('TRN_StepWipe');
    expect(a.lengthEditable(a.selected()!)).toBe(false);
    expect(a.backdropOffered(a.selected()!)).toBe(false);
    expect((await a.insert()).ok).toBe(true);
    expect(host.calls.filter((c) => c !== 'getContext')).toEqual(['getCuts', 'insertMedia']);
    expect(host.media[0].startSec).toBe(39.12);
  });

  it('AE needs no cuts; a sound has no length field', async () => {
    const host = new Host(aeContext());
    const { a } = app(host);
    await a.init();
    a.open('TRN_StepWipe');
    await a.insert();
    expect(host.calls).not.toContain('getCuts');
    a.open('SFX_WhooshIn');
    expect(a.lengthEditable(a.selected()!)).toBe(false);
  });

  it('a template takes its companions by the D14 checkboxes', async () => {
    const host = new Host(prContext());
    const { a, prepared } = app(host);
    await a.init();
    a.open('WEB_Screen');
    expect(a.state.sound).toEqual({ music: false, sfx: true });
    await a.insert();
    expect(prepared[0]).toEqual(['BG_WebinarPortal_16x9_loop_v1.mov']);
    a.setSound({ music: true, sfx: true });
    await a.insert();
    expect(prepared[1]).toEqual(['BG_WebinarPortal_16x9_loop_v1.mov', 'SFX_WebinarBed_wav_v1.wav']);
    expect(host.items[1].companions!.audio).toHaveLength(1);
  });

  it('stops before the host when the files cannot be copied', async () => {
    const host = new Host(prContext());
    const { a } = app(host, { prepareFiles: async () => { throw new Error('нет файла библиотеки C:/x.mov'); } });
    await a.init();
    a.open('BG_Arrows');
    const out = await a.insert();
    expect(out.ok).toBe(false);
    expect(out.problems.map((p) => p.code)).toContain('FILES');
    expect(out.problems.find((p) => p.code === 'FILES')!.message).toBe('Не удалось скопировать файлы рядом с проектом: нет файла библиотеки C:/x.mov.');
    expect(host.calls).not.toContain('insertMedia');
  });
});
