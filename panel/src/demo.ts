// The panel UI in a browser, without a host (vite dev server only): the first pack from library.src.json and
// a pretend Premiere sequence. For layout work and screenshots; never part of the CEP build.
import { render, h } from 'preact';
import src from '../../library/library.src.json';
import example from '../../docs/library/example.src.json';
import { PanelApp } from './app/controller';
import type { CallOptions, HostCaller, HostReply } from './core/host';
import type { InsertRequest } from './core/insert';
import type { Catalog, HostContext, Item } from './core/types';
import { App } from './ui/App';

function toItem(raw: unknown): Item {
  const it = structuredClone(raw) as Item;
  it.variants = it.variants.map((v) => ({
    ...v,
    aeComp: v.aeComp ? `${v.aeComp}_v${it.version}` : undefined,
    file: `items/${it.id}/${it.id}_${v.key}_v${it.version}.mogrt`,
    sha256: '0'.repeat(64),
    bytes: 0,
    minHostVersion: v.minHostVersion ?? { ae: '26.0', pr: '26.0' },
  }));
  it.aep = { file: `items/${it.id}/${it.id}_v${it.version}.aep`, sha256: '0'.repeat(64), bytes: 0 };
  delete it.companions;
  return it;
}

class DemoHost implements HostCaller {
  ctx: HostContext;
  constructor(host: 'ae' | 'pr', w: number, h: number) {
    this.ctx = {
      host,
      version: host === 'ae' ? '26.5x89' : '26.5.2',
      project: { saved: true, path: host === 'ae' ? 'C:/Projects/demo.aep' : 'C:/Projects/demo.prproj' },
      target: { kind: host === 'ae' ? 'comp' : 'sequence', id: '1', name: 'Монтаж', w, h, fps: 25, timeSec: 12.4, durationSec: 120 },
    };
  }
  async call<T>(fn: string, args?: unknown, _opts?: CallOptions): Promise<HostReply<T>> {
    await new Promise((r) => setTimeout(r, fn === 'insertItem' ? 500 : 30));
    if (fn === 'getContext') return { ok: true, data: this.ctx as T };
    if (fn === 'diag') return { ok: true, data: { app: 'demo' } as T };
    if (fn === 'insertItem') {
      const r = args as InsertRequest;
      return { ok: true, data: { name: r.id, startSec: r.startSec, lengthSec: r.lengthSec, readback: Object.fromEntries(r.writes.map((w) => [w.egpName, w.value])) } as T };
    }
    return { ok: false, error: { code: 'NO_FUNCTION', message: fn } };
  }
}

export function startDemo(el: HTMLElement, version: string): void {
  const q = new URLSearchParams(location.search);
  const host = q.get('host') === 'ae' ? 'ae' : 'pr';
  const [w, hh] = (q.get('frame') ?? '1920x1080').split('x').map(Number);
  const items = [...(src.items as unknown[]), ...(example.items as unknown[]).filter((i) => (i as Item).tier === 'T1' && (i as Item).id !== 'TTL_LowerThird')].map(toItem);
  // ?media=<url folder>: the first card gets preview.webm and poster.jpg from there (tests/panel/ui-dom.test.mjs).
  const media = q.get('media');
  if (media) {
    items[0].preview = { file: 'preview.webm', sha256: '0'.repeat(64), bytes: 0 };
    items[0].poster = { file: 'poster.jpg', sha256: '0'.repeat(64), bytes: 0 };
  }
  const catalog: Catalog = { schemaVersion: 1, libraryVersion: '2026.10.05', minPluginVersion: '0.1.0', items };
  const store = new Map<string, string>();
  const app = new PanelApp({
    host: new DemoHost(host, w, hh),
    hostKey: host,
    pluginVersion: version,
    platform: 'win',
    libraryRoot: 'C:/ProgramData/CloudRuBrandKit/library',
    readLibrary: async () => JSON.stringify(catalog),
    store: { get: (k) => store.get(k) ?? null, set: (k, v) => void store.set(k, v) },
    fonts: async (names) => Object.fromEntries(names.map((n) => [n, { found: true, version: 'Version 1.002' }])),
  });
  render(h(App, { app, ui: { fileUrl: (f: string) => (media ? media + f : f), copy: (t: string) => console.log(t), pickFile: host === 'ae' ? async () => 'C:/Media/visual.mp4' : undefined } }), el);
  void app.init().then(() => {
    const open = q.get('open');
    if (open) app.open(open);
  });
}
