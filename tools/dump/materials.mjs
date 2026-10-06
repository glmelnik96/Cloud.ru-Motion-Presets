#!/usr/bin/env node
// Everything phase 2 and the rest of phase 3 need from the packs, in one run on the build PC:
//   motion     docs/research/motion      segments of key pairs, AE ease as cubic-bezier, expressions (D19)
//   looks      docs/research/looks       effects with parameters, blurs (D11), text styles (D25), fonts
//   inventory  docs/research/inventory   every comp: size, timing, markers, fields, nesting, Essential Graphics
//   sounds     docs/research/sounds      every audio file: format, EBU R128 loudness, where it is used
//   node tools/dump/materials.mjs [--dumps <work>/dumps] [--packs <crbk>/packs] [--only motion,looks,inventory,sounds]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workPath } from '../lib/work.mjs';
import { packsDir } from '../packs/paths.mjs';
import { soundsInventory, soundsMarkdown } from '../packs/sounds.mjs';
import { compsMarkdown, extractComps } from './comps.mjs';
import { extractLooks, writeLooks } from './looks.mjs';
import { loadDumpRoot } from './model.mjs';
import { extractMotion, writeMotion } from './motion.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const dumps = opt('--dumps', workPath('dumps'));
const packs = opt('--packs', packsDir());
const only = (opt('--only', 'motion,looks,inventory,sounds')).split(',');
const research = (p) => path.join(REPO, 'docs', 'research', p);

if (!existsSync(dumps)) {
  console.error(`no dumps at ${dumps}: give --dumps`);
  process.exit(1);
}
const t0 = Date.now();
if (only.includes('motion')) {
  const m = extractMotion(dumps);
  writeMotion(m, research('motion'));
  console.log(`motion: ${m.packs.length} packs, ${m.segments.length} segments, ${m.expressions.length} expressions`);
}
if (only.includes('looks')) {
  const l = extractLooks(dumps);
  writeLooks(l, research('looks'));
  console.log(`looks: ${l.effects.length} effects, ${l.blurs.length} blurs, ${l.styles.length} text styles`);
}
if (only.includes('inventory')) {
  const c = extractComps(dumps);
  mkdirSync(research('inventory'), { recursive: true });
  writeFileSync(path.join(research('inventory'), 'comps.json'), JSON.stringify(c, null, 1) + '\n', 'utf8');
  writeFileSync(path.join(research('inventory'), 'comps.md'), compsMarkdown(c), 'utf8');
  console.log(`inventory: ${c.length} comps, ${c.filter((x) => x.root).length} roots`);
}
if (only.includes('sounds')) {
  const files = soundsInventory({ packs, dumps: loadDumpRoot(dumps) });
  mkdirSync(research('sounds'), { recursive: true });
  writeFileSync(path.join(research('sounds'), 'inventory.json'), JSON.stringify({ generated: new Date().toISOString(), packs, files }, null, 1) + '\n', 'utf8');
  writeFileSync(path.join(research('sounds'), 'summary.md'), soundsMarkdown(files), 'utf8');
  console.log(`sounds: ${files.length} audio files in ${packs}`);
}
console.log(`done in ${Math.round((Date.now() - t0) / 1000)} s`);
