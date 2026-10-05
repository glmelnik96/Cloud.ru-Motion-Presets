// Premiere's font check (spec 8.1: the build comes from the OpenType 'name' table; AE asks app.fonts instead).
// A port of tools/fonts/opentype-name.mjs and tools/fonts/scan-fonts.mjs onto the injected file service, with
// their rules: the PostScript name is nameID 6, the build is the first 'x.yyy' of nameID 5 ('Version 1.002' ->
// '1.002', as in brand/tokens.json), records rank Windows English > Windows > Unicode > Mac Roman, and the name
// inside the file counts, not the file name (SBSansDisplay-SemiBold.otf holds SBSansDisplay-Semibold).
// Unlike the CLI scan it reads every font file, so a renamed SB Sans is found too, and only the header, the table
// directory and the name table of each (the Windows font folder alone is about 450 MB); every readable face of a
// TTC counts.
import type { FontStatus } from '../core/types';
import { envVar } from './cep';
import type { Env } from './cep';
import { joinPosix } from './files';
import type { DirEntry, Files } from './files';

export const NAME_IDS = { family: 1, subfamily: 2, fullName: 4, version: 5, postScriptName: 6, typoFamily: 16, typoSubfamily: 17 } as const;

export type FontNames = { [K in keyof typeof NAME_IDS]: string | null } & { versionNumber: string | null };
export type ReadAt = (start: number, length: number) => Promise<Uint8Array>; // short or empty past the end
export type FontFiles = Pick<Files, 'join' | 'readBytes' | 'readDir'>;

export interface FontFile {
  build: string | null;
  file: string;
}

// One face by PostScript name: the first copy in folder order, then any further copies.
export interface ScannedFont extends FontFile {
  others: FontFile[];
}

const FONT_FILE = /\.(otf|ttf|ttc|otc)$/i;
const PREFETCH = 16 * 1024; // header, directory and name table of a CFF font in one read (SB Sans: under 2 KB)
const MAX_FACES = 256; // every face is read, so a broken face count must not mean millions of reads
const MAX_DEPTH = 4; // /System/Library/Fonts/Supplemental, the subfolders of Adobe's font folder
const PARALLEL = 8; // files read at once: keeps libuv's four I/O threads busy

// Mac OS Roman, bytes 0x80..0xFF (Unicode's ROMAN.TXT mapping).
const MAC_ROMAN_HIGH = [
  0x00c4, 0x00c5, 0x00c7, 0x00c9, 0x00d1, 0x00d6, 0x00dc, 0x00e1, 0x00e0, 0x00e2, 0x00e4, 0x00e3, 0x00e5, 0x00e7, 0x00e9, 0x00e8,
  0x00ea, 0x00eb, 0x00ed, 0x00ec, 0x00ee, 0x00ef, 0x00f1, 0x00f3, 0x00f2, 0x00f4, 0x00f6, 0x00f5, 0x00fa, 0x00f9, 0x00fb, 0x00fc,
  0x2020, 0x00b0, 0x00a2, 0x00a3, 0x00a7, 0x2022, 0x00b6, 0x00df, 0x00ae, 0x00a9, 0x2122, 0x00b4, 0x00a8, 0x2260, 0x00c6, 0x00d8,
  0x221e, 0x00b1, 0x2264, 0x2265, 0x00a5, 0x00b5, 0x2202, 0x2211, 0x220f, 0x03c0, 0x222b, 0x00aa, 0x00ba, 0x03a9, 0x00e6, 0x00f8,
  0x00bf, 0x00a1, 0x00ac, 0x221a, 0x0192, 0x2248, 0x2206, 0x00ab, 0x00bb, 0x2026, 0x00a0, 0x00c0, 0x00c3, 0x00d5, 0x0152, 0x0153,
  0x2013, 0x2014, 0x201c, 0x201d, 0x2018, 0x2019, 0x00f7, 0x25ca, 0x00ff, 0x0178, 0x2044, 0x20ac, 0x2039, 0x203a, 0xfb01, 0xfb02,
  0x2021, 0x00b7, 0x201a, 0x201e, 0x2030, 0x00c2, 0x00ca, 0x00c1, 0x00cb, 0x00c8, 0x00cd, 0x00ce, 0x00cf, 0x00cc, 0x00d3, 0x00d4,
  0xf8ff, 0x00d2, 0x00da, 0x00db, 0x00d9, 0x0131, 0x02c6, 0x02dc, 0x00af, 0x02d8, 0x02d9, 0x02da, 0x00b8, 0x02dd, 0x02db, 0x02c7,
];

const view = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);

function latin1(b: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i += 1) s += String.fromCharCode(b[i] ?? 0);
  return s;
}

export function decodeMacRoman(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b < 0x80 ? b : (MAC_ROMAN_HIGH[b - 0x80] ?? 0xfffd));
  return s;
}

// An odd last byte is dropped, as in the Node tool.
export function decodeUtf16be(bytes: Uint8Array): string {
  const v = view(bytes);
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode(v.getUint16(i));
  return s;
}

interface NameRecord {
  platformID: number;
  encodingID: number;
  languageID: number;
}

function decodeRecord(r: NameRecord, bytes: Uint8Array): string | null {
  if (r.platformID === 3 || r.platformID === 0) return decodeUtf16be(bytes);
  if (r.platformID === 1 && r.encodingID === 0) return decodeMacRoman(bytes);
  return null; // other encodings (Mac CJK, Windows symbol) are not needed for SB Sans
}

// Windows English first, then any Windows, then Unicode, then Mac Roman.
function rank(r: NameRecord): number {
  if (r.platformID === 3 && r.languageID === 0x0409) return 0;
  if (r.platformID === 3) return 1;
  if (r.platformID === 0) return 2;
  if (r.platformID === 1 && r.encodingID === 0) return 3;
  return 9;
}

function parseNameTable(t: Uint8Array): FontNames {
  const v = view(t);
  const count = v.getUint16(2);
  const storage = v.getUint16(4);
  const best = new Map<number, { rank: number; text: string }>();
  for (let i = 0; i < count; i += 1) {
    const p = 6 + 12 * i;
    const r = { platformID: v.getUint16(p), encodingID: v.getUint16(p + 2), languageID: v.getUint16(p + 4) };
    const nameID = v.getUint16(p + 6);
    const len = v.getUint16(p + 8);
    const off = storage + v.getUint16(p + 10);
    if (off + len > t.length) continue; // a broken record must not abort the scan
    const text = decodeRecord(r, t.subarray(off, off + len));
    if (text === null) continue;
    const prev = best.get(nameID);
    if (!prev || rank(r) < prev.rank) best.set(nameID, { rank: rank(r), text });
  }
  const get = (id: number): string | null => best.get(id)?.text ?? null;
  const version = get(NAME_IDS.version);
  const m = version === null ? null : /(\d+\.\d+)/.exec(version);
  return {
    family: get(NAME_IDS.family),
    subfamily: get(NAME_IDS.subfamily),
    fullName: get(NAME_IDS.fullName),
    version,
    postScriptName: get(NAME_IDS.postScriptName),
    typoFamily: get(NAME_IDS.typoFamily),
    typoSubfamily: get(NAME_IDS.typoSubfamily),
    versionNumber: m?.[1] ?? null,
  };
}

async function readFace(read: ReadAt, base: number): Promise<FontNames> {
  const head = await read(base, 12);
  if (head.length < 12) throw new Error('not an sfnt font (a face at ' + base + ', past the end of the file)');
  const numTables = view(head).getUint16(4);
  const dir = await read(base + 12, 16 * numTables);
  const v = view(dir);
  let name: { offset: number; length: number } | null = null;
  for (let i = 0; i < numTables; i += 1) {
    if (latin1(dir, 16 * i, 16 * i + 4) === 'name') name = { offset: v.getUint32(16 * i + 8), length: v.getUint32(16 * i + 12) };
  }
  if (!name) throw new Error('no name table');
  return parseNameTable(await read(name.offset, name.length)); // readBytes stops at the end of the file
}

// Every readable face of an OTF, TTF or TTC. A broken face of a collection is skipped, so it cannot hide the
// healthy ones (the CLI reads face 0 alone and finds it); throws when the file is not a font or no face reads.
export async function readFontFaces(read: ReadAt): Promise<FontNames[]> {
  const head = await read(0, 12);
  if (head.length < 12) throw new Error('not an sfnt font (too short)');
  const tag = latin1(head, 0, 4);
  if (tag !== 'ttcf') {
    if (tag !== 'OTTO' && tag !== 'true' && view(head).getUint32(0) !== 0x00010000) {
      throw new Error('not an sfnt font (bad header ' + JSON.stringify(tag) + ')');
    }
    return [await readFace(read, 0)];
  }
  const n = view(head).getUint32(8);
  if (n < 1 || n > MAX_FACES) throw new Error('not an sfnt font (a collection of ' + n + ' faces)');
  const offsets = view(await read(12, 4 * n));
  const faces: FontNames[] = [];
  const errors: unknown[] = [];
  for (let i = 0; i < n; i += 1) {
    try {
      faces.push(await readFace(read, offsets.getUint32(4 * i))); // a short offset list throws here too
    } catch (e) {
      errors.push(e);
    }
  }
  if (faces.length === 0) throw errors[0]; // face 0's reason, as the CLI would give it
  return faces;
}

export function bytesAt(bytes: Uint8Array): ReadAt {
  return async (start, length) => bytes.subarray(start, start + length);
}

// One read covers a small font or the front of a big one; a name table further in costs a second read.
export function readFontFile(files: Pick<Files, 'readBytes'>, file: string): Promise<FontNames[]> {
  let front: Uint8Array | null = null;
  return readFontFaces(async (start, length) => {
    const head = front ?? (front = await files.readBytes(file, 0, PREFETCH));
    if (start + length <= head.length || head.length < PREFETCH) return head.subarray(start, start + length);
    return files.readBytes(file, start, length);
  });
}

async function walk(files: FontFiles, dir: string, depth: number, out: string[]): Promise<void> {
  let entries: DirEntry[];
  try {
    entries = await files.readDir(dir);
  } catch {
    return; // a missing or closed folder holds no fonts
  }
  for (const entry of entries) {
    const path = files.join(dir, entry.name);
    if (entry.dir) {
      if (depth < MAX_DEPTH) await walk(files, path, depth + 1, out);
    } else if (FONT_FILE.test(entry.name)) {
      out.push(path);
    }
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// PostScript name -> build and file of every face in the folders (in order; subfolders too). Unreadable files are
// skipped: a broken font must not stop the check of the others.
export async function scanFonts(files: FontFiles, dirs: string[]): Promise<Map<string, ScannedFont>> {
  const list: string[] = [];
  for (const dir of dirs) await walk(files, dir, 0, list);
  const faces = await mapLimit(list, PARALLEL, (file) => readFontFile(files, file).catch((): FontNames[] => []));
  const found = new Map<string, ScannedFont>();
  list.forEach((file, i) => {
    for (const face of faces[i] ?? []) {
      if (!face.postScriptName) continue;
      const copy = { build: face.versionNumber, file };
      const hit = found.get(face.postScriptName);
      if (hit) hit.others.push(copy);
      else found.set(face.postScriptName, { ...copy, others: [] });
    }
  });
  return found;
}

export function fontDirs(env: Env, platform: string, home: string): string[] {
  if (platform === 'win32') {
    const windows = envVar(env, 'WINDIR') ?? envVar(env, 'SystemRoot') ?? 'C:/Windows';
    const local = envVar(env, 'LOCALAPPDATA') ?? joinPosix(home, 'AppData/Local');
    const common = envVar(env, 'CommonProgramFiles') ?? 'C:/Program Files/Common Files';
    // The last one is Adobe's own: fonts there reach AE and Premiere only.
    return [joinPosix(windows, 'Fonts'), joinPosix(local, 'Microsoft/Windows/Fonts'), joinPosix(common, 'Adobe/Fonts')];
  }
  return ['/Library/Fonts', '/System/Library/Fonts', joinPosix(home, 'Library/Fonts'), '/Library/Application Support/Adobe/Fonts'];
}

// FontStatus per required face for the preflight. Premiere may load any copy of a face installed twice, so a
// copy of another build wins and the build warning shows. Substitution is AE's notion; here it is always false.
export function fontStatus(required: { postScriptName: string; build: string }[], scanned: Map<string, ScannedFont>): FontStatus[] {
  return required.map(({ postScriptName, build }) => {
    const hit = scanned.get(postScriptName);
    if (!hit) return { postScriptName, found: false, build: null, substitute: false };
    const odd = [hit, ...hit.others].find((c) => c.build !== build);
    return { postScriptName, found: true, build: (odd ?? hit).build, substitute: false };
  });
}
