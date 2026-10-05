// Font check for Premiere (spec 6 «проверка шрифтов в Premiere», 8.1 «Шрифты»): Premiere has no font API,
// so the panel scans the font folders with Node and reads the PostScript name (nameID 6) and the version
// (nameID 5) from the OpenType 'name' table. A port of tools/fonts/opentype-name.mjs over a DataView, so it
// runs in the panel without Node's Buffer. https://learn.microsoft.com/typography/opentype/spec/name
import type { FontStatus } from '../core/types';

export interface FontNames {
  postScriptName: string | null;
  version: string | null;
}

function utf16be(view: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i + 1 < len; i += 2) s += String.fromCharCode(view.getUint16(off + i));
  return s;
}

function latin1(view: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i += 1) s += String.fromCharCode(view.getUint8(off + i));
  return s;
}

// Windows English first, then any Windows, then Unicode, then Mac Roman (ASCII part only: enough for
// PostScript names and version strings).
function rank(platform: number, encoding: number, language: number): number {
  if (platform === 3 && language === 0x0409) return 0;
  if (platform === 3) return 1;
  if (platform === 0) return 2;
  if (platform === 1 && encoding === 0) return 3;
  return 9;
}

export function readFontNames(bytes: Uint8Array, fontIndex = 0): FontNames {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12) throw new Error('not an sfnt font (too short)');
  const tag = latin1(view, 0, 4);
  let base = 0;
  if (tag === 'ttcf') {
    if (fontIndex >= view.getUint32(8)) throw new Error('font index out of range');
    base = view.getUint32(12 + 4 * fontIndex);
  } else if (!(tag === 'OTTO' || tag === 'true' || view.getUint32(0) === 0x00010000)) {
    throw new Error('not an sfnt font');
  }
  const numTables = view.getUint16(base + 4);
  let table = -1;
  for (let i = 0; i < numTables; i += 1) {
    const rec = base + 12 + 16 * i;
    if (latin1(view, rec, 4) === 'name') table = view.getUint32(rec + 8);
  }
  if (table < 0) throw new Error('no name table');
  const count = view.getUint16(table + 2);
  const storage = table + view.getUint16(table + 4);
  const best: Record<number, { rank: number; text: string }> = {};
  for (let i = 0; i < count; i += 1) {
    const p = table + 6 + 12 * i;
    const platform = view.getUint16(p);
    const encoding = view.getUint16(p + 2);
    const language = view.getUint16(p + 4);
    const nameId = view.getUint16(p + 6);
    if (nameId !== 5 && nameId !== 6) continue;
    const len = view.getUint16(p + 8);
    const off = storage + view.getUint16(p + 10);
    if (off + len > bytes.byteLength) continue;
    const r = rank(platform, encoding, language);
    if (r === 9) continue;
    const text = platform === 1 ? latin1(view, off, len) : utf16be(view, off, len);
    if (!best[nameId] || r < best[nameId].rank) best[nameId] = { rank: r, text };
  }
  return { postScriptName: best[6]?.text ?? null, version: best[5]?.text ?? null };
}

export interface FontFs {
  list(dir: string): string[];
  read(file: string): Uint8Array;
}

const FONT_FILE = /\.(otf|ttf|ttc)$/i;
const SB_FILE = /sb[\s_-]?sans/i;

// Status of each wanted PostScript name from the font folders. Only files named like SB Sans are read (the
// name inside is trusted, not the file name: SBSansDisplay-SemiBold.otf holds SBSansDisplay-Semibold).
export function scanFontFolders(fs: FontFs, dirs: string[], names: string[]): Record<string, FontStatus & { file?: string }> {
  const found = new Map<string, { version: string | null; file: string }>();
  for (const dir of dirs) {
    let files: string[] = [];
    try {
      files = fs.list(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const leaf = file.slice(file.replace(/\\/g, '/').lastIndexOf('/') + 1);
      if (!FONT_FILE.test(leaf) || !SB_FILE.test(leaf)) continue;
      try {
        const n = readFontNames(fs.read(file));
        if (n.postScriptName && !found.has(n.postScriptName)) found.set(n.postScriptName, { version: n.version, file });
      } catch {
        // an unreadable file is not a font we can vouch for
      }
    }
  }
  return Object.fromEntries(names.map((n) => {
    const f = found.get(n);
    return [n, f ? { found: true, version: f.version, file: f.file } : { found: false, version: null }];
  }));
}

// Font folders the hosts read (tools/fonts/scan-fonts.mjs fontDirs).
export function fontDirs(platform: 'win' | 'mac', env: Record<string, string | undefined>): string[] {
  const slash = (p: string) => p.replace(/\\/g, '/');
  if (platform === 'win') {
    const dirs = [slash(env.WINDIR || 'C:/Windows') + '/Fonts'];
    if (env.LOCALAPPDATA) dirs.push(slash(env.LOCALAPPDATA) + '/Microsoft/Windows/Fonts');
    dirs.push(slash(env.CommonProgramFiles || 'C:/Program Files/Common Files') + '/Adobe/Fonts');
    return dirs;
  }
  const home = env.HOME || '';
  return ['/Library/Fonts', home + '/Library/Fonts', '/Library/Application Support/Adobe/Fonts'];
}
