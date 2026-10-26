// TTL_LowerThird «Подпись спикера», style «Титры»: hidden words hang out of their plates, run in Node on a
// stand-in comp (tests/helpers/master-expr.mjs). The pack's rise left the tops of Й, Ё and Å in the name plate
// before the rise. Resolves from the dumps: the build machine only.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLYPHS } from '../../tools/masters/rig-plate.mjs';
import { P } from '../../tools/masters/spec.mjs';
import { exprComp } from '../helpers/master-expr.mjs';
import { plateOf } from '../helpers/plate-ink.mjs';

const HAS_DUMPS = ['titles/podpis_spikerov.json', 'podcast/podpis_spikera_1.json', 'webinars/zastavka_so_spikerom.json']
  .every((f) => existsSync('C:/CRBK/work/dumps/' + f));
// 24 px per character at the field's size, no descenders
const ink = (layer, s) => (s ? { l: 2, w: s.length * 24, b: 0 } : { l: 0, w: 0, b: 0 });

describe.skipIf(!HAS_DUMPS)('TTL_LowerThird «Титры»', async () => {
  // vitest runs a skipped body to collect its tests: without the dumps it must not read them
  if (!HAS_DUMPS) return;
  const { resolve } = await import('../../masters/TTL_LowerThird/resolve.mjs');
  const p = resolve();
  const L = p.layout.titles;
  const top = (size) => GLYPHS['SBSansText-Regular'].top * size;
  const below = (c, layer, t) => c.at(layer, P.pos, t)[1] + c.at(layer, P.rise(), t)[1] - top(c.size(layer));

  it('hidden words hang out of their plates: no Й, Ё or Å in a plate before the rise', () => {
    const c = exprComp(p.spec, { ctrl: { Style: 1, Side: 1 }, texts: { TXT_NAME: 'Йозеф Ёлкин', TXT_ROLE1: 'Åsa Йенсен', TXT_ROLE2: 'Cloud.ru' }, ink });
    c.size = (layer) => (layer === 'TXT_NAME' ? L.nameSize : L.roleSize);
    const t = 2;
    // the pack's 56.25 px left the tallest glyphs 7.4 px inside the name plate
    expect(c.at('TXT_NAME', P.rise(), t)[1]).toBeCloseTo(64.69, 2);
    expect(below(c, 'TXT_NAME', t)).toBeCloseTo(plateOf(c, 'PL_NAME', t).y1 + 1, 6);
    // the first of two role lines: 92.86 instead of the pack's 91.38; the second hangs as far, out of the plate
    expect(c.at('TXT_ROLE1', P.rise(), t)[1]).toBeCloseTo(92.86, 2);
    expect(below(c, 'TXT_ROLE1', t)).toBeCloseTo(plateOf(c, 'PL_ROLE', t).y1 + 1, 6);
    expect(c.at('TXT_ROLE2', P.rise(), t)).toEqual(c.at('TXT_ROLE1', P.rise(), t));
    expect(below(c, 'TXT_ROLE2', t)).toBeGreaterThan(plateOf(c, 'PL_ROLE', t).y1 + 1);
  });

  it('one role line stands on the first slot of a shorter plate: it hangs out of it too', () => {
    const c = exprComp(p.spec, { ctrl: { Style: 1, Side: 1 }, texts: { TXT_NAME: 'Имя', TXT_ROLE1: '', TXT_ROLE2: 'Ёмкая должность' }, ink });
    c.size = () => L.roleSize;
    expect(below(c, 'TXT_ROLE2', 2)).toBeGreaterThan(plateOf(c, 'PL_ROLE', 2).y1 + 1);
  });
});
