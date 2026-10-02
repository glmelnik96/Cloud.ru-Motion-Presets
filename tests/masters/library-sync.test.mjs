// library/library.src.json and the masters must say the same thing: Essential Graphics names, dropdown
// items, variants and the protected regions (duration). The masters resolve from the pack dumps, so the
// test runs only where the dumps are (the build machine).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { egpLabels } from '../../tools/masters/package.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const lib = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
const HAS_DUMPS = existsSync('C:/CRBK/work/dumps/logo/umnoe_oblako.json') && existsSync('C:/CRBK/work/dumps/titles/podpis_spikerov.json');
const MASTERS = ['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird'];

describe.skipIf(!HAS_DUMPS)('library.src.json matches the masters', () => {
  for (const id of MASTERS) {
    it(id, async () => {
      const { resolve } = await import(`../../masters/${id}/resolve.mjs`);
      const p = resolve();
      const item = lib.items.find((x) => x.id === id);
      expect(item, `${id} in library.src.json`).toBeTruthy();
      expect(item.version).toBe(p.version);
      expect(item.variants.map((v) => v.key)).toEqual(p.variants.map((v) => v.key));
      for (const v of item.variants) {
        const pv = p.variants.find((x) => x.key === v.key);
        expect([v.w, v.h, v.fps]).toEqual([pv.w, pv.h, p.comp.fps]);
        expect(v.aeComp).toBe(`${p.comp.name}_${v.key}`);
      }
      // EGP: the panel order is the reverse of the order the builder adds controllers in
      const labels = egpLabels(p).slice().reverse();
      expect(item.fields.slice().sort((a, b) => a.egpIndex - b.egpIndex).map((f) => f.egpName)).toEqual(labels);
      for (const f of item.fields) {
        const ctrl = Object.values(p.ctrl).find((c) => c.label === f.egpName);
        if (f.type === 'dropdown') {
          expect(ctrl.items).toEqual(f.options.map((o) => o.label_ru));
          expect(ctrl.value).toBe(f.default);
        } else if (f.type === 'checkbox') {
          expect(ctrl.kind).toBe('checkbox');
          expect(Boolean(ctrl.value)).toBe(f.default);
        } else if (f.type === 'text') {
          const t = Object.values(p.text).find((x) => x.label === f.egpName);
          expect(t.value).toBe(f.default);
        }
      }
      const inM = p.markers.find((m) => m.comment === 'in');
      const outM = p.markers.find((m) => m.comment === 'out');
      expect(item.duration.introSec).toBeCloseTo(inM.time + inM.duration, 6);
      expect(item.duration.outroSec).toBeCloseTo(outM.duration, 6);
      expect(item.duration.introSec + item.duration.holdSec + item.duration.outroSec).toBeCloseTo(p.comp.duration, 6);
    });
  }
});
