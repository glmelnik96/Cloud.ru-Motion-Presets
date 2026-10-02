// MOGRT capsule identity (S6). A .mogrt is a zip; definition.json at its root carries capsuleID, by which
// Premiere tells templates apart. In Adobe's AE-made templates (Premiere 2026, "[AE] Sports Package") the ID
// occurs once, in definition.json only, not inside project.aegraphic. patchCapsuleId writes a copy with a new
// ID, as premiere-autopilot scripts/mogrtcard.py does for Premiere-made templates: every occurrence of the old
// ID in definition.json is replaced as text (formatting and a BOM are kept), every other entry is copied as is.
// Two MOGRT readers stay side by side: tools/spike/mogrt.mjs (Task 9) reads the Essential Graphics controls,
// this module reads and patches capsuleID.
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';

function definitionEntry(zip) {
  const entries = zip.getEntries();
  const entry = entries.find((e) => e.entryName === 'definition.json')
    || entries.find((e) => /(^|\/)definition\.json$/.test(e.entryName));
  if (!entry) throw new Error('definition.json not found in the .mogrt');
  return entry;
}

const parse = (text) => JSON.parse(text.replace(/^\uFEFF/, ''));

export function readDefinition(file) {
  const zip = new AdmZip(file);
  return parse(zip.readFile(definitionEntry(zip)).toString('utf8'));
}

export function readCapsuleId(file) {
  const id = readDefinition(file).capsuleID;
  if (!id) throw new Error('capsuleID not found in ' + file);
  return String(id);
}

export function newCapsuleId() {
  return randomUUID();
}

export function patchCapsuleId(src, dst, newId) {
  const zip = new AdmZip(src);
  const entry = definitionEntry(zip);
  const text = zip.readFile(entry).toString('utf8');
  const oldId = parse(text).capsuleID;
  if (!oldId) throw new Error('capsuleID not found in ' + src);
  const parts = text.split(String(oldId));
  const patched = parts.join(String(newId));
  if (parse(patched).capsuleID !== String(newId)) throw new Error('capsuleID did not change in ' + src);
  zip.updateFile(entry, Buffer.from(patched, 'utf8'));
  zip.writeZip(dst);
  return { oldId: String(oldId), newId: String(newId), occurrences: parts.length - 1 };
}

// A .mogrt that After Effects may still be writing is ready when it opens as a zip whose definition.json
// carries a capsuleID; used after the file size has settled.
export function mogrtReady(file) {
  try {
    return { ok: true, capsuleID: readCapsuleId(file) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
