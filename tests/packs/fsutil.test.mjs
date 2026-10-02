import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { walkFiles, sha256File, isRenderPath, isMacJunk } from '../../tools/packs/fsutil.mjs';
import { crbkRoot, archiveDir, packDir, sourceRoot } from '../../tools/packs/paths.mjs';

describe('fsutil', () => {
  it('walks a tree into sorted POSIX paths and keeps NFD names as they are', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-walk-'));
    const nfd = 'Оверлей.wav'.normalize('NFD');
    mkdirSync(path.join(root, 'b', 'c'), { recursive: true });
    writeFileSync(path.join(root, 'b', 'c', nfd), 'x');
    writeFileSync(path.join(root, 'a.txt'), 'y');
    expect(walkFiles(root)).toEqual(['a.txt', 'b/c/' + nfd]);
  });
  it('hashes a file with sha256', async () => {
    const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'bk-hash-')), 'f.bin');
    writeFileSync(f, 'brandkit');
    expect(await sha256File(f)).toBe(createHash('sha256').update('brandkit').digest('hex'));
  });
  it('recognises render folders of the package', () => {
    expect(isRenderPath('4_SMM_Pack/Render/BG/BG_pattern_1x1_1.mov')).toBe(true);
    expect(isRenderPath('3_Обучающие_курсы/3_Обучающие курсы/Render Overlays/FullHD/x.mov')).toBe(true);
    expect(isRenderPath('6_Podcast_Cloud.ru_Pack/Ready mov/OUTRO.mov')).toBe(true);
    expect(isRenderPath('6_Podcast_Cloud.ru_Pack/(Footage)/SFX/QR_код_1.wav')).toBe(false);
    expect(isRenderPath('Render.mov')).toBe(false);
  });
  it('recognises macOS metadata files', () => {
    expect(isMacJunk('6_Podcast_Cloud.ru_Pack/(Footage)/QR/._STRDUB.png')).toBe(true);
    expect(isMacJunk('a/.DS_Store')).toBe(true);
    expect(isMacJunk('a/STRDUB.png')).toBe(false);
  });
});

describe('paths', () => {
  it('puts archive and packs next to the work folder', () => {
    expect(crbkRoot({}, 'win32')).toBe('C:/CRBK');
    expect(archiveDir({}, 'win32')).toBe('C:/CRBK/archive/2026-10-02');
    expect(packDir('logo', {}, 'win32')).toBe('C:/CRBK/packs/logo');
    expect(packDir('logo', { BRANDKIT_WORK: 'D:\\bk\\work' }, 'win32')).toBe('D:/bk/packs/logo');
    expect(archiveDir({}, 'darwin')).toBe('/Users/Shared/CRBK/archive/2026-10-02');
  });
  it('reads the source package path from BRANDKIT_SOURCE when set', () => {
    expect(sourceRoot({})).toBe('C:/Users/Глеб/Documents/Граф пакет Cloud.ru');
    expect(sourceRoot({ BRANDKIT_SOURCE: 'E:\\pkg' })).toBe('E:/pkg');
  });
});
