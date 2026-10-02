// Reads an exported .mogrt (a zip): entry list, capsuleID and Essential Graphics controls from definition.json.
// Layout seen in Adobe's own AE-made MOGRTs (Premiere 2026 "Essential Graphics" folder): definition.json,
// project.aegraphic (+ localized copies), thumb*.png; clientControls[] with type and uiName.strDB[].str.
// Shared helper: S2 uses it, and the spikes of parts C, D and E read MOGRT controls with it instead of
// writing their own reader. Reading and patching a capsuleID on its own: tools/mogrt/capsule.mjs (task 17).
import AdmZip from 'adm-zip';

// clientControls[].type in those MOGRTs. Dropdown and media replacement do not occur there; S2 records them.
export const CONTROL_TYPES = { 1: 'checkbox', 2: 'slider', 4: 'color', 6: 'text', 8: 'group' };

export function controlNames(control) {
  const db = (control && control.uiName && control.uiName.strDB) || [];
  const names = [];
  for (const s of db) if (s && typeof s.str === 'string' && s.str && !names.includes(s.str)) names.push(s.str);
  return names;
}

export function readMogrt(file) {
  const zip = new AdmZip(file);
  const entries = zip.getEntries().map((e) => e.entryName);
  const def = zip.getEntry('definition.json');
  const definition = def ? JSON.parse(zip.readAsText(def, 'utf8').replace(/^\uFEFF/, '')) : null;
  const controls = ((definition && definition.clientControls) || []).map((c) => ({
    id: c.id, type: c.type, kind: CONTROL_TYPES[c.type] || 'type' + c.type, names: controlNames(c),
  }));
  return {
    entries,
    hasDefinition: Boolean(def),
    hasAegraphic: entries.includes('project.aegraphic'),
    capsuleID: (definition && definition.capsuleID) || null,
    capsuleName: (definition && definition.capsuleName) || null,
    controls,
    definition,
  };
}

// Which expected labels appear among the control names (any locale), and how many non-group controls exist.
export function matchControls(controls, labels) {
  const all = new Set();
  for (const c of controls) for (const n of c.names) all.add(n);
  return {
    found: labels.filter((l) => all.has(l)),
    missing: labels.filter((l) => !all.has(l)),
    count: controls.filter((c) => c.kind !== 'group').length,
  };
}
