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

export function toCatalogItem(raw: unknown): Item {
  const it = structuredClone(raw) as Item;
  const dir = `items/${it.id}`;
  if (it.requiredFonts) it.requiredFonts = it.requiredFonts.map((f) => ({ postScriptName: f.postScriptName, build: BUILDS[f.postScriptName] }));
  it.variants = it.variants.map((v) => ({
    ...v,
    aeComp: v.aeComp ? `${v.aeComp}_v${it.version}` : undefined,
    file: `${dir}/${it.id}_${v.key}_v${it.version}.mogrt`,
    sha256: SHA,
    bytes: 1000,
    minHostVersion: v.minHostVersion ?? { ae: '26.0', pr: '26.0' },
  }));
  it.aep = { file: `${dir}/${it.id}_v${it.version}.aep`, sha256: SHA, bytes: 2000 };
  delete it.companions;
  return it;
}

export function catalog(): Catalog {
  return {
    schemaVersion: 1,
    libraryVersion: '2026.10.05',
    minPluginVersion: '0.1.0',
    items: (src.items as unknown[]).map(toCatalogItem),
  };
}

export const item = (id: string): Item => {
  const found = catalog().items.find((i) => i.id === id);
  if (!found) throw new Error('no item ' + id);
  return found;
};

export const webScreen = (): Item => toCatalogItem((example.items as unknown[]).find((i) => (i as Item).id === 'WEB_Screen'));

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
