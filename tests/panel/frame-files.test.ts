// A frame delivered as files (CRS_LectureFrame, D9): a still per layout and an optional drift loop, picked by the
// form (variant options), with windows for «Вписать в окно» in the look the form picked.
import { describe, expect, it } from 'vitest';
import { PanelApp, type Services } from '../../panel/src/app/controller';
import { planFit } from '../../panel/src/core/fit';
import type { CallOptions, HostCaller, HostReply } from '../../panel/src/core/host';
import { planItem } from '../../panel/src/core/insert';
import { defaultMediaLengthSec, mediaKind, pickMediaVariant } from '../../panel/src/core/media';
import { memoryStore } from '../../panel/src/core/memory';
import type { Catalog, HostContext, Item, Variant } from '../../panel/src/core/types';
import { ALL_FONTS, catalog, prContext } from './fixtures';

const env = { platform: 'win' as const, libraryRoot: 'C:/ProgramData/CloudRuBrandKit/library' };
const LAYOUTS = ['s169', 's32', 'spkL', 'spkR'];
const v = (key: string, layout: number, drift: boolean, w: number, ext: string): Variant => ({
  key, aspect: '16x9', w, h: (w * 9) / 16, fps: 25, options: { layout, drift },
  file: `items/CRS_LectureFrame/CRS_LectureFrame_${key}_v1.${ext}`, minHostVersion: { ae: '26.0', pr: '26.0' },
});

export function frameItem(): Item {
  const variants: Variant[] = [];
  LAYOUTS.forEach((l, i) => {
    variants.push(v(`16x9_${l}`, i + 1, false, 1920, 'png'), v(`16x9_4K_${l}`, i + 1, false, 3840, 'png'), v(`16x9_${l}_drift`, i + 1, true, 1920, 'mov'));
  });
  const screen = { s169: [150, 100, 1600, 900], s32: [275, 100, 1350, 900], spkL: [601, 174, 1248, 702], spkR: [71, 174, 1248, 702] };
  const speaker = { spkL: [50, 150, 500, 750], spkR: [1370, 150, 500, 750] };
  const rects = (m: Record<string, number[]>) => variants.filter((x) => Object.keys(m).some((l) => x.key.includes(`_${l}`)))
    .map((x) => { const r = m[Object.keys(m).find((l) => x.key.includes(`_${l}`))!]; const s = x.w! / 1920; return { variant: x.key, x: r[0] * s, y: r[1] * s, w: r[2] * s, h: r[3] * s }; });
  return {
    id: 'CRS_LectureFrame', title_ru: 'Рамка лекции', category: 'courses', tier: 'T2', hosts: ['ae', 'pr'], version: 1,
    loop: { periodFrames: 1500 },
    duration: { introSec: 0, holdSec: 60, outroSec: 0 },
    fields: [
      { key: 'layout', label_ru: 'Раскладка', type: 'dropdown', default: 1, options: ['Экран 16:9', 'Экран 3:2', 'Спикер слева', 'Спикер справа'].map((label_ru, i) => ({ index: i + 1, label_ru })) },
      { key: 'drift', label_ru: 'Дрейф', type: 'checkbox', default: false },
    ],
    windows: [{ key: 'screen', label_ru: 'Экран', rects: rects(screen) }, { key: 'speaker', label_ru: 'Спикер', rects: rects(speaker) }],
    variants,
  } as Item;
}

const fhd = { w: 1920, h: 1080 };
const uhd = { w: 3840, h: 2160 };

describe('a frame of files picked by the form', () => {
  it('the layout and the drift pick the file; the frame size picks FHD or 4K', () => {
    const f = frameItem();
    const pick = (frame: { w: number; h: number }, values: Record<string, number | boolean>) => pickMediaVariant(f, frame, null, values);
    expect(pick(fhd, { layout: 1, drift: false }).variant?.key).toBe('16x9_s169');
    expect(pick(fhd, { layout: 3, drift: false }).variant?.key).toBe('16x9_spkL');
    expect(pick(uhd, { layout: 4, drift: false }).variant?.key).toBe('16x9_4K_spkR');
    const loop = pick(fhd, { layout: 2, drift: true });
    expect([loop.variant?.key, mediaKind(f, loop.variant!)]).toEqual(['16x9_s32_drift', 'loop']);
    expect(mediaKind(f, pick(fhd, { layout: 2, drift: false }).variant!)).toBe('still');
    // the drift loop is FHD only: a 4K sequence gets it scaled, with consent
    const big = pick(uhd, { layout: 1, drift: true });
    expect([big.variant?.key, big.scale, big.needsConsent]).toEqual(['16x9_s169_drift', 2, true]);
  });

  it('the insert plans the picked file: a still up to the range after the playhead, or its 60 s', () => {
    const f = frameItem();
    const ctx = prContext({ target: { ...prContext().target!, rangeEndSec: 640 } });
    const p = planItem({ item: f, ctx, values: { layout: 3, drift: false }, fonts: ALL_FONTS, options: {}, env });
    expect([p.ok, p.media?.variant.key, p.media?.kind, p.media?.lengthSec]).toEqual([true, '16x9_spkL', 'still', 600]);
    const t = prContext().target!;
    expect(defaultMediaLengthSec(f, f.variants[0], t)).toBe(60);
    const loop = planItem({ item: f, ctx: prContext(), values: { layout: 1, drift: true }, fonts: ALL_FONTS, options: { lengthSec: 150 }, env });
    expect([loop.media?.variant.key, loop.media?.kind]).toEqual(['16x9_s169_drift', 'loop']);
    expect(loop.media?.layout.video.map((p) => [p.role, p.lengthSec, p.periodSec])).toEqual([['loop', 150, 60]]);
  });

  it('«Вписать в окно» takes the windows of the picked look, in the frame of the sequence', () => {
    const f = frameItem();
    const screen = planFit(f, prContext(), { layout: 2, drift: false }, 'screen');
    expect(screen.request?.rect).toEqual({ x: 275, y: 100, w: 1350, h: 900 });
    const speaker = planFit(f, prContext(), { layout: 4, drift: false }, 'speaker');
    expect(speaker.request?.rect).toEqual({ x: 1370, y: 150, w: 500, h: 750 });
    // a layout without a speaker window has none
    expect(planFit(f, prContext(), { layout: 1, drift: false }, 'speaker').ok).toBe(false);
    // 4K: the 4K still's window
    const big = planFit(f, prContext({ target: { ...prContext().target!, w: 3840, h: 2160 } }), { layout: 3, drift: false }, 'speaker');
    expect(big.request?.rect).toEqual({ x: 100, y: 300, w: 1000, h: 1500 });
  });
});

class Host implements HostCaller {
  constructor(public ctx: HostContext) {}
  async call<T>(fn: string, _args?: unknown, _opts?: CallOptions): Promise<HostReply<T>> {
    if (fn === 'getContext') return { ok: true, data: this.ctx as T };
    if (fn === 'diag') return { ok: true, data: { app: 'Premiere' } as T };
    return { ok: false, error: { code: 'NO_FUNCTION', message: fn } };
  }
}

describe('the form of a frame of files', () => {
  const withFrame = (): Catalog => { const c = catalog(); c.items.push(frameItem()); return c; };
  const make = () => new PanelApp({
    host: new Host(prContext()), hostKey: 'pr', pluginVersion: '0.1.0', platform: 'win', libraryRoot: env.libraryRoot,
    readLibrary: async () => JSON.stringify(withFrame()), store: memoryStore(),
    fonts: async (names) => Object.fromEntries(names.map((n) => [n, ALL_FONTS[n] ?? { found: false }])),
  } as Services);

  it('offers the formats of the chosen look and the windows of its layout; a lost manual format goes back to «Авто»', async () => {
    const a = make();
    await a.init();
    a.open('CRS_LectureFrame');
    expect(a.formatVariants(a.selected()!).map((x) => x.key)).toEqual(['16x9_s169', '16x9_4K_s169']);
    expect(a.fitWindows(a.selected()!).map((w) => w.key)).toEqual(['screen']);
    a.setValue('layout', 3);
    expect(a.formatVariants(a.selected()!).map((x) => x.key)).toEqual(['16x9_spkL', '16x9_4K_spkL']);
    expect(a.fitWindows(a.selected()!).map((w) => w.key)).toEqual(['screen', 'speaker']);
    a.setVariant('16x9_4K_spkL');
    expect(a.state.manualVariant).toBe('16x9_4K_spkL');
    a.setValue('drift', true);
    // the drift loop has no 4K file: the format chosen by hand is gone, «Авто» again
    expect(a.state.manualVariant).toBeNull();
    expect(a.formatVariants(a.selected()!).map((x) => x.key)).toEqual(['16x9_spkL_drift']);
    expect(a.pick()?.variant?.key).toBe('16x9_spkL_drift');
  });
});
