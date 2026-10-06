// The panel UI in a browser, without a host (vite dev server only): the first pack from library.src.json and
// a pretend Premiere sequence. For layout work and screenshots; never part of the CEP build.
import { render, h } from 'preact';
import src from '../../library/library.src.json';
import example from '../../docs/library/example.src.json';
import { PanelApp } from './app/controller';
import type { ExportRequest } from './core/export';
import type { CallOptions, HostCaller, HostReply } from './core/host';
import type { InsertRequest, MediaRequest } from './core/insert';
import type { Catalog, HostContext, Item } from './core/types';
import { App } from './ui/App';

const SHA = '0'.repeat(64);

// A source item as the catalog builder lays it out: MOGRTs and the .aep for T1, media files for T2/T3.
function toItem(raw: unknown, keepCompanions: boolean): Item {
  const it = structuredClone(raw) as Item;
  const dir = `items/${it.id}`;
  it.variants = it.variants.map((v) => {
    const out = { ...v, aeComp: v.aeComp ? `${v.aeComp}_v${it.version}` : undefined, sha256: SHA, bytes: 0, minHostVersion: v.minHostVersion ?? { ae: '26.0', pr: '26.0' } } as Item['variants'][number];
    const base = `${dir}/${it.id}_${v.key}`;
    if (it.tier === 'T1') out.file = `${base}_v${it.version}.mogrt`;
    else if (v.parts) {
      const src = v.parts as unknown as Record<string, [number, number]>;
      out.parts = Object.fromEntries(Object.entries(src).map(([p, r]) => [p, { file: `${base}_${p}_v${it.version}.mov`, sha256: SHA, bytes: 0, frames: r[1] - r[0] }]));
    } else out.file = `${base}_v${it.version}.${it.category === 'sounds' ? 'wav' : v.key === 'svg' || v.key === 'ffx' || v.key === 'epr' || v.key === 'aom' ? v.key : it.tier === 'T3' ? 'png' : 'mov'}`;
    return out;
  });
  if (it.tier === 'T1') it.aep = { file: `${dir}/${it.id}_v${it.version}.aep`, sha256: SHA, bytes: 0 };
  if (!keepCompanions) delete it.companions;
  return it;
}

class DemoHost implements HostCaller {
  ctx: HostContext;
  // ?instant=1: replies without delay, so the whole start-up can finish before the UI subscribes.
  // ?templates=0: AE has not loaded the brand .aom yet (the instruction instead of a render).
  constructor(host: 'ae' | 'pr', w: number, h: number, private readonly instant = false, private readonly templates = true) {
    this.ctx = {
      host,
      version: host === 'ae' ? '26.5x89' : '26.5.2',
      project: { saved: true, path: host === 'ae' ? 'C:/Projects/demo.aep' : 'C:/Projects/demo.prproj' },
      target: { kind: host === 'ae' ? 'comp' : 'sequence', id: '1', name: 'Монтаж', w, h, fps: 25, timeSec: 12.4, durationSec: 120 },
      selection: host === 'ae' ? 1 : 0,
    };
  }
  async call<T>(fn: string, args?: unknown, _opts?: CallOptions): Promise<HostReply<T>> {
    if (!this.instant) await new Promise((r) => setTimeout(r, fn === 'insertItem' || fn === 'insertMedia' || fn === 'applyPreset' || fn === 'applyColor' || fn === 'exportComp' || fn === 'exportSequence' || fn === 'fitClip' ? 500 : 30));
    if (fn === 'getContext') return { ok: true, data: this.ctx as T };
    if (fn === 'diag') return { ok: true, data: { app: 'demo' } as T };
    if (fn === 'insertItem') {
      const r = args as InsertRequest;
      const companions = r.companions ? [...r.companions.video, ...r.companions.audio].map((p) => ({ role: p.role, name: p.file, startSec: p.startSec ?? r.startSec, lengthSec: p.lengthSec ?? p.maxSec ?? 1 })) : [];
      return { ok: true, data: { name: r.id, startSec: r.startSec, lengthSec: r.lengthSec, readback: Object.fromEntries(r.writes.map((w) => [w.egpName, w.value])), companions } as T };
    }
    if (fn === 'insertMedia') {
      const r = args as MediaRequest;
      const l = r.layout;
      const pieces = [...l.video, ...(l.backdrop ? [{ role: 'backdrop', file: 'backdrop', startSec: l.backdrop.startSec, lengthSec: l.backdrop.lengthSec }] : []), ...l.audio];
      const placed = pieces.map((p) => ({ role: p.role, name: p.file, startSec: p.startSec ?? r.startSec, lengthSec: p.lengthSec ?? 1 }));
      return { ok: true, data: { name: r.id, startSec: r.startSec, lengthSec: r.lengthSec ?? 1, placed, imported: placed.length } as T };
    }
    if (fn === 'applyColor') return { ok: true, data: { layers: [{ name: 'Плашка', set: 2, keyed: 0, expressions: [] }] } as T };
    if (fn === 'applyPreset') return { ok: true, data: { layers: [{ name: 'Имя', layerId: 7, changed: true, firstKeySec: this.ctx.target!.timeSec }], newLayers: [] } as T };
    if (fn === 'exportSequence') {
      const r = args as ExportRequest;
      return { ok: true, data: (r.mode === 'queue' ? { file: r.output, queued: true, job: '1', inSec: 0, outSec: 120 } : { file: r.output, bytes: 1000, ms: 500 }) as T };
    }
    if (fn === 'exportComp') {
      const r = args as ExportRequest;
      if (!this.templates) return { ok: false, error: { code: 'NO_TEMPLATE', message: r.omTemplate ?? '' } };
      if (r.mode === 'background') return { ok: true, data: { file: r.output, aerender: { exe: 'C:/AE/aerender.exe', project: 'C:/Projects/demo.aep', rqIndex: 1 } } as T };
      return { ok: true, data: { file: r.output, bytes: 1000, ms: 500 } as T };
    }
    if (fn === 'selectedClip') return { ok: true, data: { track: 1, startTicks: '0', name: 'Запись спикера.mp4', src: { w: 1920, h: 1080, par: 1 } } as T };
    if (fn === 'fitClip') {
      const r = args as { scale: number; position: [number, number]; crop: unknown };
      return { ok: true, data: { name: 'Запись спикера.mp4', scale: r.scale, position: r.position, normalized: true, crop: r.crop, cropAdded: !!r.crop, cropMissing: false } as T };
    }
    if (fn === 'getCuts') return { ok: true, data: { cuts: [this.ctx.target!.timeSec - 0.4] } as T };
    return { ok: false, error: { code: 'NO_FUNCTION', message: fn } };
  }
}

export function startDemo(el: HTMLElement, version: string): void {
  const q = new URLSearchParams(location.search);
  const host = q.get('host') === 'ae' ? 'ae' : 'pr';
  const [w, hh] = (q.get('frame') ?? '1920x1080').split('x').map(Number);
  const items = [
    ...(src.items as unknown[]).map((i) => toItem(i, false)),
    ...(example.items as unknown[]).filter((i) => (i as Item).id !== 'TTL_LowerThird').map((i) => toItem(i, true)),
  ];
  // ?media=<url folder>: the first card gets preview.webm and poster.jpg from there (tests/panel/ui-dom.test.mjs).
  const media = q.get('media');
  if (media) {
    items[0].preview = { file: 'preview.webm', sha256: '0'.repeat(64), bytes: 0 };
    items[0].poster = { file: 'poster.jpg', sha256: '0'.repeat(64), bytes: 0 };
    // The lower third gets previews per format and style (the form switches between them).
    const ttl = items.find((i) => i.id === 'TTL_LowerThird');
    if (ttl) {
      ttl.previews = ['16x9_style-1', '16x9_style-2', '9x16_style-1'].map((stem) => {
        const [variant, style] = stem.split('_style-');
        return { variant, when: { style: Number(style) }, video: { file: `preview_${stem}.webm`, sha256: SHA, bytes: 0 }, poster: { file: `poster_${stem}.jpg`, sha256: SHA, bytes: 0 } };
      });
    }
  }
  const catalog: Catalog = { schemaVersion: 1, libraryVersion: '2026.10.05', minPluginVersion: '0.1.0', items };
  const store = new Map<string, string>();
  const app = new PanelApp({
    host: new DemoHost(host, w, hh, q.get('instant') === '1', q.get('templates') !== '0'),
    hostKey: host,
    pluginVersion: version,
    platform: 'win',
    libraryRoot: 'C:/ProgramData/CloudRuBrandKit/library',
    readLibrary: async () => JSON.stringify(catalog),
    store: { get: (k) => store.get(k) ?? null, set: (k, v) => void store.set(k, v) },
    fonts: async (names) => Object.fromEntries(names.map((n) => [n, { found: true, version: 'Version 1.002' }])),
    prepareFiles: async (p) => ({ copied: p.copies.map((c) => c.to), reused: [], written: p.solids.map((x) => x.path) }),
    // Files of the demo: what was «exported» exists, so the next export of the same preset gets _2.
    exportFs: { size: (p) => (written.has(p) ? 1000 : null), mkdirp: () => undefined, documents: 'C:/Users/demo/Documents' },
    aerender: async (job) => {
      await new Promise((r) => setTimeout(r, 800));
      return { ok: true, code: 0, tail: [`rendered item ${job.rqIndex}`] };
    },
    reveal: (path) => console.log('reveal', path),
  });
  const written = new Set<string>();
  app.subscribe((st) => {
    if (st.outcome?.file) written.add(st.outcome.file);
  });
  render(h(App, { app, ui: { fileUrl: (f: string) => (media ? media + f : f), copy: (t: string) => console.log(t), pickFile: host === 'ae' ? async () => 'C:/Media/visual.mp4' : undefined } }), el);
  void app.init().then(() => {
    const open = q.get('open');
    if (open) app.open(open);
  });
}
