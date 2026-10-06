// Every service the CEP runtime offers and the controller can take reaches the controller in main.tsx.
// Export 0.1.14 on the PC (2026-10-06): exportFs, aerender and reveal were left out, so the panel had no _2,
// no background render and no «Показать в папке», while the tests with their own services passed.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(new URL(`../../panel/src/${p}`, import.meta.url), 'utf8');

// Member names of an interface: `name(` or `name:` or `name?:` at the start of a line inside its block.
function members(src, name) {
  const start = src.indexOf(`export interface ${name}`);
  const body = src.slice(src.indexOf('{', start) + 1, src.indexOf('\n}', start));
  return [...body.matchAll(/^ {2}([A-Za-z]+)\??[(:]/gm)].map((m) => m[1]);
}

describe('panel start-up', () => {
  it('passes every runtime service the controller takes', () => {
    const services = members(read('app/controller.ts'), 'Services');
    const runtime = members(read('services/cep.ts'), 'CepRuntime');
    const shared = services.filter((k) => runtime.includes(k) && k !== 'host' && k !== 'platform' && k !== 'libraryRoot');
    expect(shared).toEqual(expect.arrayContaining(['fonts', 'prepareFiles', 'exportFs', 'aerender', 'reveal']));
    const main = read('main.tsx');
    expect(shared.filter((k) => !main.includes(`${k}: rt.${k}`))).toEqual([]);
  });
});
