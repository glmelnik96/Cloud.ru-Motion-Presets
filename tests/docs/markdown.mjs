// Table rows of a markdown document whose first cell matches `id`; cells split on unescaped pipes.
import { readFileSync } from 'node:fs';

export function readDoc(rel) {
  return readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
}

export function tableRows(md, id) {
  return md
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim()))
    .filter((cells) => id.test(cells[0]));
}
