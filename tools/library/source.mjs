// The library source as the catalog build sees it: library.src.json, with the sounds of sounds.src.json next to it
// (tools/sounds/build-sounds.mjs) merged in as items of the «Звуки» category.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { soundItem } from '../sounds/process.mjs';

const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const readJson = (p) => JSON.parse(stripBom(readFileSync(p, 'utf8')));

export function loadSource(file) {
  const doc = readJson(file);
  const sounds = path.join(path.dirname(file), 'sounds.src.json');
  if (path.basename(file) === 'library.src.json' && existsSync(sounds)) {
    doc.items = [...doc.items, ...readJson(sounds).sounds.map(soundItem)];
  }
  return doc;
}
