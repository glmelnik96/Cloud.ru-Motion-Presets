import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanFonts, fontDirs } from '../../tools/fonts/scan-fonts.mjs';
import { sbFont } from '../helpers/make-font.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'bk-fonts-'));
const slash = (p) => p.replace(/\\/g, '/');

describe('scan-fonts', () => {
  it('reads the real PostScript name of SB Sans files and skips the rest', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'SBSansDisplay-SemiBold.otf'), sbFont('SBSansDisplay-Semibold', '1.002'));
    writeFileSync(path.join(dir, 'arial.ttf'), sbFont('ArialMT', '7.03'));
    writeFileSync(path.join(dir, 'SBSansBroken.otf'), Buffer.from('garbage, not a font at all'));
    const r = scanFonts({ dirs: [dir, path.join(dir, 'missing')] });
    expect(r.fonts.map((f) => [f.postScriptName, f.version])).toEqual([['SBSansDisplay-Semibold', '1.002']]);
    expect(r.fonts[0].file).toBe(slash(path.join(dir, 'SBSansDisplay-SemiBold.otf')));
    expect(r.errors.map((e) => path.basename(e.file))).toEqual(['SBSansBroken.otf']);
    expect(r.dirs[1].exists).toBe(false);
  });
  it('with --all finds renamed SB Sans files by their PostScript name', () => {
    const dir = tmp();
    mkdirSync(path.join(dir, 'sub'));
    writeFileSync(path.join(dir, 'sub', 'font1.otf'), sbFont('SBSansText-Regular', '1.003'));
    writeFileSync(path.join(dir, 'font2.otf'), sbFont('Verdana', '5.33'));
    expect(scanFonts({ dirs: [dir] }).fonts).toEqual([]);
    expect(scanFonts({ dirs: [dir], all: true }).fonts.map((f) => f.postScriptName)).toEqual(['SBSansText-Regular']);
  });
  it('reports one face installed twice with different builds', () => {
    const a = tmp();
    const b = tmp();
    writeFileSync(path.join(a, 'SBSansDisplay-Regular.otf'), sbFont('SBSansDisplay-Regular', '1.002'));
    writeFileSync(path.join(b, 'SBSansDisplay-Regular.otf'), sbFont('SBSansDisplay-Regular', '1.000'));
    const r = scanFonts({ dirs: [a, b] });
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].postScriptName).toBe('SBSansDisplay-Regular');
    expect(r.conflicts[0].versions.sort()).toEqual(['1.000', '1.002']);
  });
  it('lists the Windows and macOS font folders', () => {
    expect(fontDirs('win32', { WINDIR: 'C:\\Windows', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', CommonProgramFiles: 'C:\\Program Files\\Common Files' }))
      .toEqual(['C:/Windows/Fonts', 'C:/Users/u/AppData/Local/Microsoft/Windows/Fonts', 'C:/Program Files/Common Files/Adobe/Fonts']);
    expect(fontDirs('darwin', { HOME: '/Users/u' }))
      .toEqual(['/Library/Fonts', '/Users/u/Library/Fonts', '/Library/Application Support/Adobe/Fonts']);
  });
});
