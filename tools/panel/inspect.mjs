#!/usr/bin/env node
// Summary of a CEP manifest or a .zxp for task 29 (criteria K1 and K2):
//   node tools/panel/inspect.mjs <CSXS/manifest.xml | file.zxp> [--hosts AEFT,PPRO]
// Exit code 1 when the hosts are not covered or a .zxp is unsigned or has no manifest.
import { readManifest, coversHosts } from './manifest-info.mjs';
import { zxpInfo } from './zxp-info.mjs';

const argv = process.argv.slice(2);
const file = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--hosts');
const h = argv.indexOf('--hosts');
const hosts = (h === -1 ? 'AEFT,PPRO' : String(argv[h + 1] || '')).split(',').filter(Boolean);

if (!file) {
  console.error('usage: node tools/panel/inspect.mjs <CSXS/manifest.xml | file.zxp> [--hosts AEFT,PPRO]');
  process.exitCode = 2;
} else {
  const z = /\.zxp$/i.test(file) ? zxpInfo(file) : null;
  const info = z ? z.manifest : readManifest(file);
  if (z) console.log('zxp: ' + z.sizeBytes + ' bytes, ' + z.entries + ' entries, signed ' + z.signed + ', .debug ' + z.hasDebugFile);
  if (!info) {
    console.log('manifest: missing');
    process.exitCode = 1;
  } else {
    const c = coversHosts(info, hosts);
    console.log('manifest: ' + info.bundleId + ' ' + info.bundleVersion + ', CSXS ' + info.csxs + ', '
      + info.extensions.length + ' extension(s), hosts ' + info.hosts.map((x) => x.name + ' ' + x.version).join(', '));
    console.log('covers ' + hosts.join('+') + ': ' + c.ok + (c.missing.length ? ' (missing ' + c.missing.join('; ') + ')' : ''));
    if (!c.ok || (z && !z.signed)) process.exitCode = 1;
  }
}
