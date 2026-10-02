import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TICKS_PER_SECOND, TPF_25, prRoot, presetSources, stagePreset, clearFrames } from '../../tools/pr/env.mjs';

const tmp = (p) => mkdtempSync(path.join(os.tmpdir(), p));

describe('pr env', () => {
  it('knows a 25p frame in ticks', () => {
    expect(TPF_25).toBe(10160640000);
    expect(TPF_25 * 25).toBe(TICKS_PER_SECOND);
  });

  it('finds the presets under the Premiere folder on Windows and on a Mac', () => {
    expect(presetSources({}, 'win32').seq1080p25)
      .toBe('C:/Program Files/Adobe/Adobe Premiere Pro 2026/Settings/SequencePresets/HD 1080p/HD 1080p 25 fps.sqpreset');
    expect(presetSources({}, 'win32').pngStill)
      .toBe('C:/Program Files/Adobe/Adobe Premiere Pro 2026/MediaIO/systempresets/3F3F3F3F_504E4720/PNG Sequence (Match Source).epr');
    expect(prRoot({}, 'darwin')).toBe('/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents');
    expect(prRoot({ BRANDKIT_PR_ROOT: 'D:\\Apps\\Pr' }, 'win32')).toBe('D:/Apps/Pr');
  });

  it('copies a preset into the work folder and refuses a missing one', () => {
    const src = path.join(tmp('bk-pe-'), 'x.epr');
    writeFileSync(src, '<epr/>');
    const dst = stagePreset(src, 'X.epr', tmp('bk-pd-'));
    expect(readFileSync(dst, 'utf8')).toBe('<epr/>');
    expect(dst).toMatch(/\/X\.epr$/);
    expect(() => stagePreset(src + '.missing', 'Y.epr', tmp('bk-pd-'))).toThrow(/preset not found/);
  });

  it('removes the frames of earlier attempts for the given keys only', () => {
    const dir = tmp('bk-fr-');
    for (const f of ['a.png', 'a_direct00000.png', 'ab.png', 'b.png']) writeFileSync(path.join(dir, f), 'x');
    expect(clearFrames(dir, ['a'])).toBe(2);
    expect(readdirSync(dir).sort()).toEqual(['ab.png', 'b.png']);
    expect(clearFrames(path.join(dir, 'none'), ['a'])).toBe(0);
  });
});
