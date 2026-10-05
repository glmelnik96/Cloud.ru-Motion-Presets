// The synthetic T2/T3 pack of the live media checks (tools/panel/media-fixtures.mjs), built with ffmpeg on a
// fake build of the lower third: the catalog passes validate.mjs, parts have their frame counts, the
// transition covers the frame fully at its cutFrame and not before.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { itemFiles } from '../../tools/library/build-catalog.mjs';
import { buildMediaFixtures } from '../../tools/panel/media-fixtures.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const SRC = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;

function fakeLowerThird(build) {
  const item = SRC.items.find((i) => i.id === 'TTL_LowerThird');
  for (const f of itemFiles(item)) {
    if (f.optional) continue;
    const p = path.join(build, f.from);
    mkdirSync(path.dirname(p), { recursive: true });
    if (!f.from.endsWith('.mogrt')) {
      writeFileSync(p, 'aep');
      continue;
    }
    const zip = new AdmZip();
    const controls = item.fields.map((x, i) => ({
      id: String(i),
      type: { text: 6, checkbox: 1, slider: 2, dropdown: 13 }[x.type],
      uiName: { strDB: [{ localeString: 'ru_RU', str: x.egpName }] },
      ...(x.type === 'dropdown' ? { items: x.options.map((o) => o.label_ru) } : {}),
    }));
    zip.addFile('definition.json', Buffer.from(JSON.stringify({ capsuleID: 'c-' + path.basename(p), clientControls: controls })));
    zip.addFile('project.aegraphic', Buffer.from('x'));
    zip.writeZip(p);
  }
}

// Alpha of one pixel of one frame.
function alpha(file, frame, x, y) {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', `select=eq(n\\,${frame}),crop=1:1:${x}:${y}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { encoding: 'buffer' });
  return r.stdout[3];
}

const frames = (file) => Number(spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim());

describe.skipIf(!HAS_FFMPEG)('synthetic media pack', () => {
  it('builds a valid catalog with the lower third and its companions', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-media-'));
    fakeLowerThird(path.join(root, 'build'));
    const r = await buildMediaFixtures({ realBuild: path.join(root, 'build'), out: path.join(root, 'media') });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    const lib = JSON.parse(readFileSync(path.join(r.libraryRoot, 'library.json'), 'utf8'));
    expect(lib.items.map((i) => i.id)).toEqual(['TTL_LowerThird', 'TRN_StepWipe', 'BG_Arrows', 'BG_DotGrid', 'SFX_WhooshIn']);
    const arrows = lib.items.find((i) => i.id === 'BG_Arrows').variants[0];
    expect(Object.fromEntries(Object.entries(arrows.parts).map(([k, v]) => [k, v.frames]))).toEqual({ intro: 25, loop: 250, outro: 25 });
    expect(frames(path.join(r.libraryRoot, arrows.parts.loop.file))).toBe(250);

    const wipe = path.join(r.libraryRoot, lib.items.find((i) => i.id === 'TRN_StepWipe').variants[0].file);
    expect(frames(wipe)).toBe(25);
    // full cover from frame 12 (cutFrame) through 16, partial before and after
    for (const f of [12, 14, 16]) expect([alpha(wipe, f, 10, 540), alpha(wipe, f, 1910, 540)]).toEqual([255, 255]);
    expect(alpha(wipe, 11, 1910, 540)).toBe(0);
    expect(alpha(wipe, 17, 10, 540)).toBe(0);
    // the loop starts where the intro ends: the box in the centre, not on the right
    const loop = path.join(r.libraryRoot, arrows.parts.loop.file);
    const intro = path.join(r.libraryRoot, arrows.parts.intro.file);
    expect([alpha(loop, 0, 960, 540), alpha(intro, 24, 960, 540), alpha(loop, 0, 1300, 540)]).toEqual([255, 255, 0]);
    expect(alpha(path.join(r.libraryRoot, 'items/BG_DotGrid/BG_DotGrid_16x9_v1.png'), 0, 1, 540)).toBe(255);
    expect(existsSync(path.join(r.libraryRoot, 'items/SFX_WhooshIn/SFX_WhooshIn_wav_v1.wav'))).toBe(true);
    // a second run makes nothing again
    const again = await buildMediaFixtures({ realBuild: path.join(root, 'build'), out: path.join(root, 'media') });
    expect(again.made).toEqual([]);
  }, 120000);

  it('adds the effects when the AE presets are there', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-media-fx-'));
    fakeLowerThird(path.join(root, 'build'));
    const presets = path.join(root, 'Presets');
    for (const parts of [['Text', 'Animate In', 'Fade Up Characters.ffx'], ['Transitions - Wipes', 'Linear Wipe.ffx']]) {
      mkdirSync(path.join(presets, ...parts.slice(0, -1)), { recursive: true });
      writeFileSync(path.join(presets, ...parts), 'RIFX ' + parts.at(-1));
    }
    const r = await buildMediaFixtures({ realBuild: path.join(root, 'build'), out: path.join(root, 'media'), presets });
    expect(r.problems).toEqual([]);
    expect(r.fx).toBe(true);
    const lib = JSON.parse(readFileSync(path.join(r.libraryRoot, 'library.json'), 'utf8'));
    expect(lib.items.filter((i) => i.category === 'effects').map((i) => [i.id, i.variants[0].file])).toEqual([
      ['FX_TextRise', 'items/FX_TextRise/FX_TextRise_ffx_v1.ffx'],
      ['FX_PlateGrow', 'items/FX_PlateGrow/FX_PlateGrow_ffx_v1.ffx'],
    ]);
    expect(readFileSync(path.join(r.libraryRoot, 'items/FX_PlateGrow/FX_PlateGrow_ffx_v1.ffx'), 'utf8')).toBe('RIFX Linear Wipe.ffx');
  }, 120000);
});

