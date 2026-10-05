// Pack-1 fixtures for the core tests. library/library.src.json becomes a catalog the way the builder does it
// (tests/tools/library-validate.test.mjs catalog()): font builds pinned from brand/tokens.json, aeComp + '_v<N>',
// a .mogrt file with sha256 and bytes per variant, and the item .aep. No files on disk are needed.
// The JSON is imported rather than read with node:fs: panel/tsconfig.json type-checks tests/panel without Node types.
import src from '../../../library/library.src.json';
import tokens from '../../../brand/tokens.json';
import type { FontStatus, HostContext, Item, Library, Variant } from '../../../panel/src/core/types';

const SHA = 'a'.repeat(64);
const BUILD = new Map<string, string>(Object.values(tokens.type.fonts).map((f) => [f.postScriptName, f.build]));

export function catalog(): Library {
  const items = (structuredClone(src.items) as unknown as Item[]).map((it) => {
    const out: Item = {
      ...it,
      variants: it.variants.map((v) => ({
        ...v,
        aeComp: `${v.aeComp}_v${it.version}`,
        file: `items/${it.id}/${it.id}_${v.key}_v${it.version}.mogrt`,
        sha256: SHA,
        bytes: 1000,
      })),
      aep: { file: `items/${it.id}/${it.id}_v${it.version}.aep`, sha256: SHA, bytes: 2000 },
    };
    if (it.requiredFonts) {
      out.requiredFonts = it.requiredFonts.map((f) => ({ postScriptName: f.postScriptName, build: BUILD.get(f.postScriptName) ?? '' }));
    }
    return out;
  });
  return { schemaVersion: 1, libraryVersion: '2026.10.05', minPluginVersion: '0.1.0', items };
}

export function item(id: string): Item {
  const found = catalog().items.find((i) => i.id === id);
  if (!found) throw new Error('no item ' + id);
  return found;
}

export function variant(it: Item, key: string): Variant {
  const found = it.variants.find((v) => v.key === key);
  if (!found) throw new Error(`${it.id} has no variant ${key}`);
  return found;
}

type Target = NonNullable<HostContext['target']>;
type Project = HostContext['project'];

const PR_PROJECT: Project = { path: 'C:/CRBK/work/pr/CRT_panel_pr.prproj', saved: true };
const AE_PROJECT: Project = { path: 'C:/CRBK/work/panel/CRT_panel_ae.aep', saved: true };

// Premiere 26.5.2, a saved project, a 1080p25 sequence with the playhead at 12 s.
export function prCtx(target: Partial<Target> | null = {}, project: Project = PR_PROJECT): HostContext {
  return {
    host: 'pr',
    hostVersion: '26.5.2',
    project,
    target: target && {
      kind: 'sequence', id: 'seq-0001', name: 'Секвенция 1', w: 1920, h: 1080, fps: 25, timeSec: 12, ticks: '3048192000000',
      ...target,
    },
  };
}

// AE 26.5, a saved project, a 1920x1080 25p comp at 2 s.
export function aeCtx(target: Partial<Target> | null = {}, project: Project = AE_PROJECT): HostContext {
  return {
    host: 'ae',
    hostVersion: '26.5x89',
    project,
    target: target && { kind: 'comp', id: '17', name: 'Композиция 1', w: 1920, h: 1080, fps: 25, timeSec: 2, ...target },
  };
}

// Every required font found with the reference build, unless overridden by PostScript name.
export function fontsFor(it: Item, over: Record<string, Partial<FontStatus>> = {}): FontStatus[] {
  return (it.requiredFonts ?? []).map((f) => ({
    postScriptName: f.postScriptName, found: true, build: f.build, substitute: false, ...over[f.postScriptName],
  }));
}
