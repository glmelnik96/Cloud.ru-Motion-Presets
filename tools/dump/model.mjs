// Reading JSX dumps in Node (schema crbk-dump/1, written by tools/dump/dump-project.jsx).
// A dump folder: index.json (comp list), project.json (items, footage, fonts), <compSlug>.json per comp.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// ExtendScript may write a UTF-8 BOM.
export function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function readJson(file) {
  return JSON.parse(stripBom(readFileSync(file, 'utf8')));
}

export function loadDumpDir(dir) {
  const index = readJson(path.join(dir, 'index.json'));
  const projectFile = path.join(dir, 'project.json');
  const project = existsSync(projectFile) ? readJson(projectFile) : null;
  const comps = index.comps.map((c) => readJson(path.join(dir, c.file)));
  return { dir, index, project, comps };
}

// Pack dump folders under a root (<root>/<slug>/index.json), sorted; unfinished *.tmp folders and
// the skipped ones (the phase-0 fixture) are left out.
export function listDumpDirs(root, { skip = ['fixture'] } = {}) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.endsWith('.tmp') && !skip.includes(e.name) && existsSync(path.join(root, e.name, 'index.json')))
    .map((e) => path.join(root, e.name))
    .sort();
}

export function loadDumpRoot(root, opts) {
  return listDumpDirs(root, opts).map(loadDumpDir);
}

export function findLayers(dump, name) {
  return (dump.layers || []).filter((l) => l.name === name);
}

export function child(node, matchName) {
  return ((node && node.children) || []).find((c) => c.matchName === matchName) || null;
}

// Follows a matchName path through property nodes: propAt(layer.props, ['ADBE Transform Group', 'ADBE Position']).
export function propAt(nodes, matchNames) {
  let list = nodes || [];
  let cur = null;
  for (const mn of matchNames) {
    cur = list.find((n) => n.matchName === mn) || null;
    if (!cur) return null;
    list = cur.children || [];
  }
  return cur;
}

export function layerProp(layer, ...matchNames) {
  return propAt(layer && layer.props, matchNames);
}

// Depth-first over property nodes. trail: display names down to the node; off: the node or a parent
// group has its eyeball switched off (enabled === false).
export function* walkNodes(nodes, trail = [], off = false) {
  for (const node of nodes || []) {
    const t = trail.concat(node.name || node.matchName || '?');
    const o = off || node.enabled === false;
    yield { node, trail: t, off: o };
    if (node.children) yield* walkNodes(node.children, t, o);
  }
}

// Every property node of a layer: the props tree, effect parameters and mask properties.
export function* walkLayer(layer) {
  for (const it of walkNodes(layer.props)) yield { ...it, area: 'props', effect: null };
  for (const fx of layer.effects || []) {
    for (const it of walkNodes(fx.params, [fx.name], fx.enabled === false)) yield { ...it, area: 'effect', effect: fx };
  }
  for (const m of layer.masks || []) {
    const nodes = ['path', 'feather', 'opacity', 'expansion'].map((k) => m[k]).filter(Boolean).concat(m.other || []);
    for (const it of walkNodes(nodes, [m.name])) yield { ...it, area: 'mask', effect: null };
  }
}

// Static value or keyframe values of a property node as [{ time, value }]; time is null for a static value.
export function nodeValues(node) {
  if (!node) return [];
  if (Array.isArray(node.keys) && node.keys.length) {
    return node.keys.filter((k) => k && 'value' in k).map((k) => ({ time: k.time, value: k.value }));
  }
  return 'value' in node ? [{ time: null, value: node.value }] : [];
}

export function isNfd(s) {
  return typeof s === 'string' && s !== s.normalize('NFC');
}
