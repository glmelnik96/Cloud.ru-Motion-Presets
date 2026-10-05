import { afterAll, describe, it, expect } from 'vitest';
import { createFiles, posixPath } from '../../../panel/src/services/files';
import type { Files } from '../../../panel/src/services/files';
import { bytesAt, fontDirs, fontStatus, readFontFaces, readFontFile, scanFonts } from '../../../panel/src/services/fonts';
import type { ScannedFont } from '../../../panel/src/services/fonts';
import * as fontFixtures from '../../helpers/make-font.mjs';
import * as nodeFontTool from '../../../tools/fonts/opentype-name.mjs';

// The panel tsconfig has no Node types (types: []); the tests run in Node, so the built-ins come in untyped.
const nodeModule = 'node:module';
const { createRequire } = (await import(nodeModule)) as { createRequire(url: string): (id: string) => any };
const req = createRequire(import.meta.url);
const fs = req('fs');
const os = req('os');
const nodePath = req('path');

const made: string[] = [];
const tmp = (): string => {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'crbk-fonts-'));
  made.push(dir);
  return posixPath(dir);
};
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

const files = createFiles(req);

// tests/helpers/make-font.mjs and the Node tool are untyped JS; these are the shapes the tests use.
interface NameRec {
  platformID: number;
  encodingID: number;
  languageID: number;
  nameID: number;
  text?: string;
  bytes?: Uint8Array;
}
const { makeFont, makeTtc, win, mac, sbFont } = fontFixtures as unknown as {
  makeFont(options: { sfnt?: string; names: NameRec[]; base?: number }): Uint8Array;
  makeTtc(font: Uint8Array): Uint8Array;
  win(nameID: number, text: string, languageID?: number): NameRec;
  mac(nameID: number, text: string): NameRec;
  sbFont(postScriptName: string, version: string): Uint8Array;
};
const { readFontNames } = nodeFontTool as unknown as {
  readFontNames(file: string): { postScriptName: string; versionNumber: string | null };
};

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// A TTC with several faces: makeFont's `base` puts each face's name table at its absolute offset.
function collection(faces: NameRec[][]): Uint8Array {
  const head = new Uint8Array(12 + 4 * faces.length);
  const view = new DataView(head.buffer);
  head.set([0x74, 0x74, 0x63, 0x66]); // 'ttcf'
  view.setUint32(4, 0x00010000);
  view.setUint32(8, faces.length);
  const fonts: Uint8Array[] = [];
  let at = head.length;
  faces.forEach((names, i) => {
    view.setUint32(12 + 4 * i, at);
    const font = makeFont({ base: at, names });
    fonts.push(font);
    at += font.length;
  });
  return concat(head, ...fonts);
}

// A font whose name table sits `pad` bytes further, past the first read of the scanner.
function farName(names: NameRec[], pad: number): Uint8Array {
  const font = makeFont({ base: pad, names });
  return concat(font.subarray(0, 28), new Uint8Array(pad), font.subarray(28));
}

// A collection whose listed faces point past the end of the file (offset 0x7fffffff).
function lostFaces(ttc: Uint8Array, ...lost: number[]): Uint8Array {
  const view = new DataView(ttc.buffer, ttc.byteOffset, ttc.byteLength);
  for (const i of lost) view.setUint32(12 + 4 * i, 0x7fffffff);
  return ttc;
}

const faces = (bytes: Uint8Array) => readFontFaces(bytesAt(bytes));

describe('font names', () => {
  it('reads the PostScript name and the build from Windows records', async () => {
    const [face] = await faces(makeFont({ names: [win(1, 'SB Sans Display Semibold'), win(5, 'Version 1.002;hotconv 1.0.109'), win(6, 'SBSansDisplay-Semibold')] }));
    expect(face?.postScriptName).toBe('SBSansDisplay-Semibold');
    expect(face?.version).toBe('Version 1.002;hotconv 1.0.109');
    expect(face?.versionNumber).toBe('1.002');
    expect(face?.family).toBe('SB Sans Display Semibold');
  });

  it('reads Mac Roman records when there is no Windows record', async () => {
    const cafe = { platformID: 1, encodingID: 0, languageID: 0, nameID: 1, bytes: new Uint8Array([0x43, 0x61, 0x66, 0x8e]) };
    const [face] = await faces(makeFont({ names: [mac(5, 'Version 1.000'), mac(6, 'SBSansText-Regular'), cafe] }));
    expect(face?.postScriptName).toBe('SBSansText-Regular');
    expect(face?.versionNumber).toBe('1.000');
    expect(face?.family).toBe('Caf\u00e9');
  });

  it('prefers Windows English, then other Windows languages, then Unicode, then Mac', async () => {
    const uni = { platformID: 0, encodingID: 3, languageID: 0, nameID: 6, text: 'FromUnicode' };
    expect((await faces(makeFont({ names: [mac(6, 'FromMac'), win(6, 'FromRu', 0x0419), win(6, 'FromEn')] })))[0]?.postScriptName).toBe('FromEn');
    expect((await faces(makeFont({ names: [mac(6, 'FromMac'), uni, win(6, 'FromRu', 0x0419)] })))[0]?.postScriptName).toBe('FromRu');
    expect((await faces(makeFont({ names: [mac(6, 'FromMac'), uni] })))[0]?.postScriptName).toBe('FromUnicode');
  });

  it('decodes UTF-16 names beyond Latin and skips encodings it does not know', async () => {
    const big5 = { platformID: 1, encodingID: 2, languageID: 0, nameID: 4, bytes: new Uint8Array([0xa4, 0x40]) };
    const [face] = await faces(makeFont({ names: [win(4, 'Шрифт × Ё'), big5, win(6, 'Ps')] }));
    expect(face?.fullName).toBe('Шрифт × Ё');
    const [macOnly] = await faces(makeFont({ names: [big5, mac(6, 'Ps')] }));
    expect(macOnly?.fullName).toBeNull();
  });

  it('accepts the TrueType header and every face of a collection', async () => {
    expect((await faces(makeFont({ sfnt: 'truetype', names: [win(6, 'TT')] })))[0]?.postScriptName).toBe('TT');
    expect((await faces(makeTtc(makeFont({ base: 16, names: [win(6, 'InTtc')] })))).map((f) => f.postScriptName)).toEqual(['InTtc']);
    const two = collection([[win(6, 'Face-Regular'), win(5, 'Version 2.010')], [win(6, 'Face-Bold'), win(5, 'Version 2.011')]]);
    expect((await faces(two)).map((f) => [f.postScriptName, f.versionNumber])).toEqual([['Face-Regular', '2.010'], ['Face-Bold', '2.011']]);
  });

  it('skips a broken face of a collection and keeps the others', async () => {
    const tail = lostFaces(collection([[win(6, 'SBSansText-Regular'), win(5, 'Version 1.003')], [win(6, 'Lost-Bold')]]), 1);
    expect((await faces(tail)).map((f) => [f.postScriptName, f.versionNumber])).toEqual([['SBSansText-Regular', '1.003']]);
    const head = lostFaces(collection([[win(6, 'Lost-Regular')], [win(6, 'Face-Bold'), win(5, 'Version 2.011')]]), 0);
    expect((await faces(head)).map((f) => f.postScriptName)).toEqual(['Face-Bold']);
    const miscounted = collection([[win(6, 'Face-Regular')], [win(6, 'Face-Bold')]]);
    miscounted.set([0, 0, 0, 3], 8); // a count of three: the third offset is face 0's 'OTTO' tag, far past the end
    expect((await faces(miscounted)).map((f) => f.postScriptName)).toEqual(['Face-Regular', 'Face-Bold']);
  });

  it('rejects a collection none of whose faces can be read', async () => {
    const none = lostFaces(collection([[win(6, 'Lost-Regular')], [win(6, 'Lost-Bold')]]), 0, 1);
    await expect(faces(none)).rejects.toThrow(/past the end/);
  });

  it('returns null for names the font does not have or a version without a number', async () => {
    const [onlyPs] = await faces(makeFont({ names: [win(6, 'OnlyPs')] }));
    expect(onlyPs?.version).toBeNull();
    expect(onlyPs?.versionNumber).toBeNull();
    const [odd] = await faces(makeFont({ names: [win(5, 'Version 2'), win(6, 'Odd')] }));
    expect(odd?.versionNumber).toBeNull();
  });

  it('skips a record that points outside the name table', async () => {
    const font = makeFont({ names: [win(6, 'Good'), win(4, 'Cut')] });
    const cut = font.subarray(0, font.length - 2); // the last string loses its tail
    const [face] = await faces(cut);
    expect(face?.postScriptName).toBe('Good');
    expect(face?.fullName).toBeNull();
  });

  it('rejects files that are not fonts', async () => {
    const text = (s: string) => new Uint8Array(Array.from(s, (c) => c.charCodeAt(0)));
    await expect(faces(text('this is not a font file at all'))).rejects.toThrow(/not an sfnt/);
    await expect(faces(text('tiny'))).rejects.toThrow(/too short/);
    const noName = makeFont({ names: [] });
    noName.set([0x68, 0x65, 0x61, 0x64], 12); // the only table is now 'head'
    await expect(faces(noName)).rejects.toThrow(/no name table/);
    const absurd = new Uint8Array(12);
    absurd.set([0x74, 0x74, 0x63, 0x66, 0, 1, 0, 0, 0, 1, 0x86, 0xa0]); // 'ttcf' with 100000 faces
    await expect(faces(absurd)).rejects.toThrow(/collection of 100000 faces/);
  });

  it('reads a font file in one go when the name table is near the start', async () => {
    const dir = tmp();
    fs.writeFileSync(dir + '/near.otf', sbFont('SBSansText-Regular', '1.003'));
    fs.writeFileSync(dir + '/far.ttf', farName([win(6, 'Far-Regular'), win(5, 'Version 3.000')], 100_000));
    let reads = 0;
    const counted: Files = { ...files, readBytes: (f, start, length) => ((reads += 1), files.readBytes(f, start, length)) };
    expect((await readFontFile(counted, dir + '/near.otf')).map((f) => f.postScriptName)).toEqual(['SBSansText-Regular']);
    expect(reads).toBe(1);
    reads = 0;
    expect((await readFontFile(counted, dir + '/far.ttf')).map((f) => [f.postScriptName, f.versionNumber])).toEqual([['Far-Regular', '3.000']]);
    expect(reads).toBe(2);
  });
});

describe('font scan', () => {
  it('finds faces by the PostScript name inside the file, not by the file name', async () => {
    const dir = tmp();
    fs.writeFileSync(dir + '/SBSansDisplay-SemiBold.otf', sbFont('SBSansDisplay-Semibold', '1.002'));
    fs.writeFileSync(dir + '/renamed123.OTF', sbFont('SBSansText-Regular', '1.003'));
    fs.writeFileSync(dir + '/notes.txt', sbFont('NotAFontFile', '1.000'));
    fs.writeFileSync(dir + '/broken.ttf', 'garbage, not a font at all');
    fs.writeFileSync(dir + '/collection.ttc', collection([[win(6, 'Coll-A'), win(5, 'Version 1.100')], [win(6, 'Coll-B')]]));
    fs.mkdirSync(dir + '/Supplemental');
    fs.writeFileSync(dir + '/Supplemental/deep.ttf', farName([win(6, 'Deep-Regular'), win(5, 'Version 5.120')], 70_000));
    const found = await scanFonts(files, [dir, dir + '/missing']);
    expect([...found.keys()].sort()).toEqual(['Coll-A', 'Coll-B', 'Deep-Regular', 'SBSansDisplay-Semibold', 'SBSansText-Regular']);
    expect(found.get('SBSansDisplay-Semibold')).toEqual({ build: '1.002', file: dir + '/SBSansDisplay-SemiBold.otf', others: [] });
    expect(found.get('SBSansText-Regular')?.file).toBe(dir + '/renamed123.OTF');
    expect(found.get('Coll-A')?.build).toBe('1.100');
    expect(found.get('Coll-B')).toEqual({ build: null, file: dir + '/collection.ttc', others: [] });
    expect(found.get('Deep-Regular')).toEqual({ build: '5.120', file: dir + '/Supplemental/deep.ttf', others: [] });
  });

  it('finds the healthy face of a collection with a broken one, as the Node tool does', async () => {
    const dir = tmp();
    const ttc = lostFaces(collection([[win(6, 'SBSansText-Regular'), win(5, 'Version 1.003')], [win(6, 'Lost-Bold')]]), 1);
    fs.writeFileSync(dir + '/SBSansText.ttc', concat(ttc, new Uint8Array(20_000))); // past the first read: the bad face goes to the disk
    const found = await scanFonts(files, [dir]);
    expect([...found.keys()]).toEqual(['SBSansText-Regular']);
    expect(found.get('SBSansText-Regular')).toEqual({ build: '1.003', file: dir + '/SBSansText.ttc', others: [] });
    expect(readFontNames(dir + '/SBSansText.ttc')).toMatchObject({ postScriptName: 'SBSansText-Regular', versionNumber: '1.003' });
  });

  it('keeps the first copy of a face and lists the other copies', async () => {
    const system = tmp();
    const user = tmp();
    fs.writeFileSync(system + '/SBSansDisplay-Regular.otf', sbFont('SBSansDisplay-Regular', '1.002'));
    fs.writeFileSync(user + '/SBSansDisplay-Regular.otf', sbFont('SBSansDisplay-Regular', '1.000'));
    const found = await scanFonts(files, [system, user]);
    expect(found.get('SBSansDisplay-Regular')).toEqual({
      build: '1.002',
      file: system + '/SBSansDisplay-Regular.otf',
      others: [{ build: '1.000', file: user + '/SBSansDisplay-Regular.otf' }],
    });
  });

  it('returns an empty map when no folder exists', async () => {
    expect((await scanFonts(files, [tmp() + '/none'])).size).toBe(0);
  });
});

describe('font status', () => {
  const at = (build: string | null, file: string, others: ScannedFont['others'] = []): ScannedFont => ({ build, file, others });

  it('marks required faces found or missing with the build on disk', () => {
    const scanned = new Map([['SBSansText-Regular', at('1.003', 'C:/Windows/Fonts/SBSansText-Regular.otf')]]);
    expect(fontStatus([
      { postScriptName: 'SBSansText-Regular', build: '1.003' },
      { postScriptName: 'SBSansDisplay-Bold', build: '1.002' },
    ], scanned)).toEqual([
      { postScriptName: 'SBSansText-Regular', found: true, build: '1.003', substitute: false },
      { postScriptName: 'SBSansDisplay-Bold', found: false, build: null, substitute: false },
    ]);
  });

  it('reports another build when one face is installed twice', () => {
    const scanned = new Map([
      ['SBSansDisplay-Regular', at('1.002', 'C:/Windows/Fonts/a.otf', [{ build: '1.000', file: 'C:/Users/u/AppData/Local/Microsoft/Windows/Fonts/a.otf' }])],
      ['SBSansDisplay-Bold', at('1.000', 'C:/Windows/Fonts/b.otf', [{ build: '1.002', file: 'C:/x/b.otf' }])],
    ]);
    expect(fontStatus([
      { postScriptName: 'SBSansDisplay-Regular', build: '1.002' },
      { postScriptName: 'SBSansDisplay-Bold', build: '1.002' },
    ], scanned).map((s) => s.build)).toEqual(['1.000', '1.000']);
  });

  it('is case-sensitive like PostScript names', () => {
    const scanned = new Map([['SBSansDisplay-Semibold', at('1.002', 'C:/Windows/Fonts/x.otf')]]);
    expect(fontStatus([{ postScriptName: 'SBSansDisplay-SemiBold', build: '1.002' }], scanned)[0]?.found).toBe(false);
  });
});

describe('font folders', () => {
  it('lists the Windows system and per-user folders, then the Adobe one', () => {
    expect(fontDirs({ windir: 'C:\\Windows', LOCALAPPDATA: 'C:\\Users\\Глеб\\AppData\\Local', CommonProgramFiles: 'C:\\Program Files\\Common Files' }, 'win32', 'C:\\Users\\Глеб'))
      .toEqual(['C:/Windows/Fonts', 'C:/Users/Глеб/AppData/Local/Microsoft/Windows/Fonts', 'C:/Program Files/Common Files/Adobe/Fonts']);
    expect(fontDirs({}, 'win32', 'C:\\Users\\u'))
      .toEqual(['C:/Windows/Fonts', 'C:/Users/u/AppData/Local/Microsoft/Windows/Fonts', 'C:/Program Files/Common Files/Adobe/Fonts']);
  });

  it('lists the three macOS folders, then the Adobe one', () => {
    expect(fontDirs({}, 'darwin', '/Users/gleb'))
      .toEqual(['/Library/Fonts', '/System/Library/Fonts', '/Users/gleb/Library/Fonts', '/Library/Application Support/Adobe/Fonts']);
  });
});

// The real font folders of this machine: the port must agree with tools/fonts/opentype-name.mjs on the SB Sans
// files and scan every installed font quickly enough for the panel start.
const env = req('process').env;
const realDirs = fontDirs(env, req('process').platform, posixPath(os.homedir()));
const sbFiles = realDirs.flatMap((d) => {
  try {
    return fs.readdirSync(d).filter((n: string) => /^SBSans.*\.otf$/i.test(n)).map((n: string) => d + '/' + n);
  } catch {
    return [];
  }
});

describe.skipIf(sbFiles.length === 0)('font scan on this machine', () => {
  it('agrees with the Node tool on every SB Sans file and finds the faces of the catalog', async () => {
    const t0 = Date.now();
    const found = await scanFonts(files, realDirs);
    expect(Date.now() - t0).toBeLessThan(10_000);
    for (const file of sbFiles) {
      const ref = readFontNames(file);
      const hit = found.get(ref.postScriptName);
      const copies = hit ? [{ build: hit.build, file: hit.file }, ...hit.others] : [];
      expect(copies).toContainEqual({ build: ref.versionNumber, file });
    }
    for (const ps of ['SBSansDisplay-Regular', 'SBSansDisplay-Semibold', 'SBSansDisplay-Bold', 'SBSansText-Regular']) {
      expect(found.get(ps)?.build).toMatch(/^\d+\.\d{3}$/);
    }
  }, 20_000);
});
