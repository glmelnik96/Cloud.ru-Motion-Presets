// Catalog fixtures for the panel tests: the real library.src.json turned into a catalog the way
// tools/library/build-catalog.mjs does it (no files on disk), plus a trim template from the example source.
import src from '../../library/library.src.json';
import example from '../../docs/library/example.src.json';
import type { Catalog, HostContext, Item } from '../../panel/src/core/types';

const SHA = 'a'.repeat(64);
const BUILDS: Record<string, string> = {
  'SBSansDisplay-Regular': '1.002',
  'SBSansDisplay-Semibold': '1.002',
  'SBSansDisplay-Bold': '1.002',
  'SBSansText-Regular': '1.003',
};

// The file a variant gets in the catalog, by tier and kind the way build-catalog.mjs names them.
function mediaExt(it: Item, key: string): string {
  if (it.category === 'sounds') return 'wav';
  if (key === 'svg') return 'svg';
  if (key === 'ffx') return 'ffx';
  if (key === 'epr' || key === 'aom') return key;
  return it.tier === 'T3' ? 'png' : 'mov';
}

export function toCatalogItem(raw: unknown, keepCompanions = false): Item {
  const it = structuredClone(raw) as Item;
  const dir = `items/${it.id}`;
  if (it.requiredFonts) it.requiredFonts = it.requiredFonts.map((f) => ({ postScriptName: f.postScriptName, build: BUILDS[f.postScriptName] }));
  it.variants = it.variants.map((v) => {
    const base = `${dir}/${it.id}_${v.key}`;
    const out = {
      ...v,
      aeComp: v.aeComp ? `${v.aeComp}_v${it.version}` : undefined,
      sha256: SHA,
      bytes: 1000,
      minHostVersion: v.minHostVersion ?? { ae: '26.0', pr: '26.0' },
    } as Item['variants'][number];
    if (it.tier === 'T1') out.file = `${base}_v${it.version}.mogrt`;
    else if (v.parts) {
      const src = v.parts as unknown as Record<string, [number, number]>;
      out.parts = Object.fromEntries(Object.entries(src).map(([p, r]) => [p, { file: `${base}_${p}_v${it.version}.mov`, sha256: SHA, bytes: 1000, frames: r[1] - r[0] }]));
    } else out.file = `${base}_v${it.version}.${mediaExt(it, v.key)}`;
    return out;
  });
  if (it.tier === 'T1') it.aep = { file: `${dir}/${it.id}_v${it.version}.aep`, sha256: SHA, bytes: 2000 };
  if (!keepCompanions) delete it.companions;
  return it;
}

// The templates of the first pack; the export presets of library.src.json are in export.test.ts and
// tests/tools/export-pack.test.mjs.
export function catalog(): Catalog {
  return {
    schemaVersion: 1,
    libraryVersion: '2026.10.05',
    minPluginVersion: '0.1.0',
    items: (src.items as unknown[]).filter((i) => (i as Item).category !== 'export').map((i) => toCatalogItem(i)),
  };
}

export const item = (id: string): Item => {
  const found = catalog().items.find((i) => i.id === id);
  if (!found) throw new Error('no item ' + id);
  return found;
};

export const webScreen = (): Item => toCatalogItem((example.items as unknown[]).find((i) => (i as Item).id === 'WEB_Screen'));

// Every item of the example source with its companions: T1 templates, loops, a transition, a still, sounds.
export function exampleCatalog(): Catalog {
  return { schemaVersion: 1, libraryVersion: '2026.10.05', minPluginVersion: '0.1.0', items: (example.items as unknown[]).map((i) => toCatalogItem(i, true)) };
}

export const exampleItem = (id: string): Item => {
  const found = exampleCatalog().items.find((i) => i.id === id);
  if (!found) throw new Error('no example item ' + id);
  return found;
};

export const lookupExample = (id: string): Item | undefined => exampleCatalog().items.find((i) => i.id === id);

export function aeContext(over: Partial<HostContext> = {}): HostContext {
  return {
    host: 'ae',
    version: '26.5x89',
    project: { saved: true, path: 'C:/CRBK/work/user/user.aep' },
    target: { kind: 'comp', id: '12', name: 'Main', w: 1920, h: 1080, fps: 25, timeSec: 2, durationSec: 30 },
    color: { workingSpace: 'None', linearize: false, bpc: 8, colorManagement: 'adobe', engine: 'javascript-1.0' },
    ...over,
  };
}

export function prContext(over: Partial<HostContext> = {}): HostContext {
  return {
    host: 'pr',
    version: '26.5.2',
    project: { saved: true, path: 'C:/CRBK/work/pr/edit.prproj' },
    target: { kind: 'sequence', id: 'seq-1', name: 'Edit', w: 1920, h: 1080, fps: 25, timeSec: 40, durationSec: 120 },
    ...over,
  };
}

export const ALL_FONTS = Object.fromEntries(Object.entries(BUILDS).map(([ps, b]) => [ps, { found: true, version: `Version ${b}` }]));
