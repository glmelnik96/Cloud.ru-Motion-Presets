// Pure relink logic for one pack copy: which footage items need a new file, which file, and whether
// the result is acceptable. AE does the replacing (relink.jsx); Node decides (here, unit-tested).
import { nfc } from './slug.mjs';

const norm = (p) => nfc(String(p).replace(/\\/g, '/'));
const lower = (p) => norm(p).toLowerCase();
export const baseName = (p) => {
  const parts = norm(p).split(/[\\/:]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
};
// Base names compared NFC, case-insensitive, any Unicode space as a plain space (macOS screen
// recordings use U+202F).
export const nameKey = (p) => baseName(p).replace(/\s/g, ' ').toLowerCase();

// "(Footage)/Folder/Video/x.mp4" from any path that runs through a "(Footage)" folder:
// a Mac path "/Volumes/T7_Black/_Video/2_Вебинары/(Footage)/..." or a Windows one.
export function footageRel(p) {
  const segs = norm(p).split(/[\\/:]+/).filter(Boolean);
  const i = segs.findIndex((s) => s.toLowerCase() === '(footage)');
  return i === -1 ? null : segs.slice(i).join('/');
}

export function isInside(p, dir) {
  return lower(p).startsWith(lower(dir).replace(/\/+$/, '') + '/');
}

function group(list, keyOf) {
  const m = new Map();
  for (const x of list) {
    const k = keyOf(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

// footage: rows from relink.jsx scan. map: relink-map.json "map" (old rel NFC -> new abs).
// files: absolute paths of every file under <pack>/(Footage).
export function resolveFootage(footage, { packDir, map, files }) {
  const byRel = new Map(Object.entries(map).map(([k, v]) => [lower(k), norm(v)]));
  const byOldName = group(Object.keys(map), nameKey);
  const byName = group(files.map(norm), nameKey);
  const ok = [];
  const replace = [];
  const unresolved = [];
  for (const it of footage) {
    if (it.placeholder) { unresolved.push({ ...it, reason: 'placeholder' }); continue; }
    if (!it.missing && it.path && isInside(it.path, packDir)) { ok.push(it); continue; }
    const was = it.missing ? 'missing' : 'external';
    if (!it.path) { unresolved.push({ ...it, reason: was + ': no path' }); continue; }
    if (/\[\d+-\d+\]/.test(it.name)) { unresolved.push({ ...it, reason: was + ': image sequence' }); continue; }
    const rel = footageRel(it.path);
    let target = rel ? byRel.get(lower(rel)) : undefined;
    let via = 'map';
    if (!target) {
      const olds = byOldName.get(nameKey(it.path)) || [];
      if (olds.length === 1) { target = norm(map[olds[0]]); via = 'map-name'; }
    }
    if (!target) {
      const hits = byName.get(nameKey(it.path)) || [];
      if (hits.length > 1) { unresolved.push({ ...it, reason: was + ': ambiguous', candidates: hits }); continue; }
      if (hits.length === 1) { target = hits[0]; via = 'name'; }
    }
    if (!target) { unresolved.push({ ...it, reason: was + ': not in pack' }); continue; }
    replace.push({ id: it.id, name: it.name, path: target, via, was });
  }
  return { ok, replace, unresolved };
}

// after: the 'apply' or 'report' reply of relink.jsx.
export function acceptance(after, { packDir, knownMissing = [] }) {
  const missing = after.footage.filter((f) => f.missing);
  const external = after.footage.filter((f) => !f.missing && f.path && !isInside(f.path, packDir));
  const allowed = new Set(knownMissing.map(nameKey));
  const unexpectedMissing = missing.filter((f) => !allowed.has(nameKey(f.path || f.name)));
  const fonts = after.fonts || { used: [], missingOrSubstituted: [] };
  const usedSubstitutes = fonts.used.filter((f) => f.isSubstitute);
  // quirk #187: a brand font whose file is not its own (e.g. times.ttf) is a silent substitute
  const suspicious = fonts.used.filter((f) => /^SBSans/i.test(f.postScriptName || '') && f.location && !/sbsans/i.test(f.location));
  return {
    missing: missing.map((f) => ({ id: f.id, name: f.name, path: f.path })),
    external: external.map((f) => ({ id: f.id, name: f.name, path: f.path })),
    unexpectedMissing: unexpectedMissing.map((f) => f.name),
    usedSubstitutes: usedSubstitutes.map((f) => f.postScriptName),
    suspiciousFonts: suspicious.map((f) => f.postScriptName + ' @ ' + f.location),
    relinkOk: unexpectedMissing.length === 0 && external.length === 0,
    goldenOk: missing.length === 0 && external.length === 0 && usedSubstitutes.length === 0 && suspicious.length === 0,
  };
}
