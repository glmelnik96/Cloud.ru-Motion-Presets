// Card previews: what each master shows, the frame grid, and the encode by ffmpeg on frames drawn here
// (AE renders the real ones on the build PC).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { defaultCombo, encodePreview, parsePreviewName, posterArgs, previewCombos, previewFrames, previewName, previewSpec, videoArgs } from '../../tools/masters/preview.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const SRC = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
const item = (id) => SRC.items.find((i) => i.id === id);
const ref = (id) => JSON.parse(readFileSync(path.join(REPO, 'masters', id, 'ref.json'), 'utf8'));
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;

describe('card previews', () => {
  it('reads what each master shows from ref.json, the poster in the middle of the hold', () => {
    const ttl = previewSpec(item('TTL_LowerThird'), ref('TTL_LowerThird'));
    expect(ttl).toMatchObject({ variant: '16x9', ctrl: { Style: 1, Side: 1 }, backdrop: '#5A5A5A', fps: 12.5, durationSec: 6, posterSec: 3.1 });
    expect(ttl.text.TXT_NAME).toBe('Анна Иванова');
    for (const id of ['LOGO_Shot', 'LOGO_Mark']) {
      const s = previewSpec(item(id), ref(id));
      expect(s.variant).toBe('16x9');
      expect(s.ctrl.Background).toBe(2);
    }
    expect(previewSpec(item('LOGO_Mark'), {})).toMatchObject({ backdrop: '#222222', ctrl: {} });
  });

  it('renders one preview per proportion and per value of the look switches (ref.preview.axes)', () => {
    // user 2026-10-05: switching the format or the style left the same preview
    const plan = (id) => {
      const it = item(id);
      const spec = previewSpec(it, ref(id));
      const combos = previewCombos(it, spec, it.variants.map((v) => ({ key: v.key, w: v.w, h: v.h, comp: `CR_${v.key}` })));
      return { combos, def: defaultCombo(combos, spec) };
    };
    const ttl = plan('TTL_LowerThird');
    expect(ttl.combos.map((c) => c.name)).toEqual(['16x9_style-1', '16x9_style-2', '16x9_style-3', '9x16_style-1', '9x16_style-2', '9x16_style-3', '1x1_style-1', '1x1_style-2', '1x1_style-3']);
    expect(ttl.combos[4]).toMatchObject({ variant: { key: '9x16' }, when: { style: 2 }, ctrl: { Style: 2, Side: 1 } });
    expect(ttl.def.name).toBe('16x9_style-1');
    expect(plan('LOGO_Shot').combos).toHaveLength(12);
    const mark = plan('LOGO_Mark');
    expect(mark.combos.map((c) => c.name).slice(0, 4)).toEqual(['16x9_plate-on_theme-1', '16x9_plate-on_theme-2', '16x9_plate-off_theme-1', '16x9_plate-off_theme-2']);
    expect(mark.combos[2].ctrl).toMatchObject({ Plate: 0, Theme: 1, Background: 2 });
    expect(mark.def.name).toBe('16x9_plate-on_theme-2');
  });

  it('names preview files and reads the names back with the types of the fields', () => {
    expect(previewName('9x16', { style: 2 })).toBe('9x16_style-2');
    expect(previewName('16x9', { plate: false, theme: 1 })).toBe('16x9_plate-off_theme-1');
    expect(parsePreviewName('16x9_4K_style-3', item('TTL_LowerThird'))).toEqual({ variant: '16x9_4K', when: { style: 3 } });
    expect(parsePreviewName('16x9_plate-off_theme-1', item('LOGO_Mark'))).toEqual({ variant: '16x9', when: { plate: false, theme: 1 } });
    expect(parsePreviewName('4x5_style-1', item('TTL_LowerThird'))).toBeNull();
    expect(parsePreviewName('16x9_plate-2', item('LOGO_Mark'))).toBeNull();
    expect(parsePreviewName('16x9_nope-1', item('LOGO_Mark'))).toBeNull();
  });

  it('renders the whole template once on the preview grid', () => {
    const f = previewFrames({ durationSec: 6, fps: 12.5 }, 'C:/w');
    expect(f).toHaveLength(75);
    expect(f[0]).toEqual({ t: 0, file: 'C:/w/f0000.png' });
    expect(f[74].t).toBe(5.92);
  });

  it('lays the frames over the backdrop and scales them to the card width', () => {
    const spec = { backdrop: '#5A5A5A', fps: 12.5 };
    expect(videoArgs({ dir: 'C:/w', spec, w: 1920, h: 1080, out: 'C:/o/preview.mp4' })).toEqual([
      '-f', 'lavfi', '-i', 'color=c=0x5A5A5A:s=1920x1080:r=12.5', '-framerate', '12.5', '-i', 'C:/w/f%04d.png',
      '-filter_complex', '[0:v][1:v]overlay=shortest=1:format=auto,scale=480:-2:flags=lanczos,format=yuv420p[v]',
      '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', 'C:/o/preview.mp4',
    ]);
    expect(posterArgs({ frame: 'C:/w/f0038.png', spec, w: 1920, h: 1080, out: 'C:/o/poster.jpg' })).toContain('C:/w/f0038.png');
    // a vertical variant fits the same 480 px box by its height
    expect(videoArgs({ dir: 'C:/w', spec, w: 1080, h: 1920, out: 'C:/o/p.mp4' })[9]).toBe('[0:v][1:v]overlay=shortest=1:format=auto,scale=-2:480:flags=lanczos,format=yuv420p[v]');
  });

  it.skipIf(!HAS_FFMPEG)('encodes a 480 px H.264 preview and a poster from transparent frames', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-prev-')).replace(/\\/g, '/');
    const spec = { ...previewSpec(item('LOGO_Mark'), {}), fps: 12.5 };
    const w = 320;
    const h = 180;
    for (const f of previewFrames(spec, dir)) {
      const png = new PNG({ width: w, height: h });
      const x0 = Math.round((f.t / spec.durationSec) * (w - 40));
      for (let y = 70; y < 110; y += 1) {
        for (let x = x0; x < x0 + 40; x += 1) {
          const i = (y * w + x) * 4;
          png.data.set([38, 208, 124, 255], i);
        }
      }
      writeFileSync(f.file, PNG.sync.write(png));
    }
    const r = encodePreview({ dir, spec, w, h, outDir: dir });
    expect(r.frames).toBe(50); // LOGO_Mark lasts 4 s
    expect(r.posterSec).toBe(3.12);
    const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', r.video], { encoding: 'utf8' }).stdout).streams;
    expect(probe).toHaveLength(1);
    expect(probe[0]).toMatchObject({ codec_name: 'h264', width: 480, height: 270, pix_fmt: 'yuv420p' });
    expect(Number(probe[0].nb_frames)).toBe(50);
    const jpg = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', r.poster], { encoding: 'utf8' }).stdout).streams[0];
    expect([jpg.width, jpg.height]).toEqual([480, 270]);
    expect(statSync(r.video).size).toBeGreaterThan(1000);
  }, 60000);
});
