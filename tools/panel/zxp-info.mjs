// Looks inside a .zxp (a zip): is it signed (META-INF/signatures.xml), does it carry CSXS/manifest.xml,
// did a .debug file slip in, how many entries and bytes. The signature itself is checked by
// ZXPSignCmd -verify; this shows the package is complete and hands its manifest to manifest-info.mjs.
import { statSync } from 'node:fs';
import AdmZip from 'adm-zip';
import { manifestInfo } from './manifest-info.mjs';

export function zxpInfo(file) {
  const zip = new AdmZip(file);
  const names = zip.getEntries().filter((e) => !e.isDirectory).map((e) => e.entryName);
  const entry = zip.getEntry('CSXS/manifest.xml');
  return {
    file,
    sizeBytes: statSync(file).size,
    entries: names.length,
    signed: names.includes('META-INF/signatures.xml'),
    hasManifest: Boolean(entry),
    hasDebugFile: names.includes('.debug'),
    manifest: entry ? manifestInfo(zip.readAsText(entry, 'utf8')) : null,
  };
}
