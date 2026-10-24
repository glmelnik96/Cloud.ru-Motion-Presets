// library/library.src.json and the masters must say the same thing: Essential Graphics names, dropdown
// items, variants and the protected regions (duration). The masters resolve from the pack dumps, so the
// test runs only where the dumps are (the build machine).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { egpLabels } from '../../tools/masters/package.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const lib = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
const HAS_DUMPS = ['logo/umnoe_oblako.json', 'titles/podpis_spikerov.json', 'podcast/tekst_na_plashke_1.json', 'podcast/diskleymer.json', 'podcast/o_goste.json', 'podcast/kontent_3.json', 'podcast/qr_kod_3.json', 'smm/zastavka_9x16.json', 'smm/plashki_9x16.json', 'courses/overley_16_na_9.json', 'courses/overley_3_na_2.json', 'courses/oblozhka_1.json', 'courses/oblozhka_2.json', 'courses/oblozhka_3.json', 'courses/perekhod.json', 'webinars/taymer_so_spikerom.json', 'webinars/anons_vebinar_9x16.json', 'webinars/logoblok_s_chelkoy.json']
  .every((f) => existsSync('C:/CRBK/work/dumps/' + f));
const MASTERS = ['LOGO_Shot', 'LOGO_Mark', 'TTL_LowerThird', 'TTL_Plate', 'TTL_PlateSwap', 'TTL_Subscribe', 'TTL_Disclaimer', 'POD_Frame', 'POD_Guest', 'POD_Content', 'POD_QR', 'SMM_ShortsIntro', 'CRS_Subtitles', 'CRS_Cover', 'WEB_Screen', 'WEB_Announce', 'LOGO_Header'];

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
      // a trim master (C23) has no protected regions: its comp is the longest insert
      if (item.fit === 'trim') {
        expect(item.duration).toEqual(p.duration);
        expect(item.duration.maxSec).toBe(p.comp.duration);
        expect(p.markers).toEqual([]);
        return;
      }
      const inM = p.markers.find((m) => m.comment === 'in');
      const outM = p.markers.find((m) => m.comment === 'out');
      expect(item.duration.introSec).toBeCloseTo(inM.time + inM.duration, 6);
      // a master without an exit (TTL_Disclaimer) has no «out» region
      expect(item.duration.outroSec).toBeCloseTo(outM ? outM.duration : 0, 6);
      expect(item.duration.introSec + item.duration.holdSec + item.duration.outroSec).toBeCloseTo(p.comp.duration, 6);
    });
  }
});
