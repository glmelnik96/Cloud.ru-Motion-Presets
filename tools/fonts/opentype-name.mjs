// Reads names from an OpenType/TrueType font file: the sfnt table directory and the 'name' table.
// nameID 5 is the version string ("Version 1.002"), nameID 6 the PostScript name.
// Platform 3 (Windows) and platform 0 (Unicode) strings are UTF-16BE; platform 1 (Mac) encoding 0
// is Mac Roman. Spec: https://learn.microsoft.com/typography/opentype/spec/name
import { readFileSync } from 'node:fs';

export const NAME_IDS = { family: 1, subfamily: 2, fullName: 4, version: 5, postScriptName: 6, typoFamily: 16, typoSubfamily: 17 };

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

export function decodeMacRoman(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b < 0x80 ? b : MAC_ROMAN_HIGH[b - 0x80]);
  return s;
}

export function decodeUtf16be(bytes) {
  const even = Buffer.from(bytes.subarray(0, bytes.length - (bytes.length % 2)));
  return even.swap16().toString('utf16le');
}

function decodeRecord(r, bytes) {
  if (r.platformID === 3 || r.platformID === 0) return decodeUtf16be(bytes);
  if (r.platformID === 1 && r.encodingID === 0) return decodeMacRoman(bytes);
  return null; // other encodings (Mac CJK, Windows symbol) are not needed for SB Sans
}

// Windows English first, then any Windows, then Unicode, then Mac Roman.
function rank(r) {
  if (r.platformID === 3 && r.languageID === 0x0409) return 0;
  if (r.platformID === 3) return 1;
  if (r.platformID === 0) return 2;
  if (r.platformID === 1 && r.encodingID === 0) return 3;
  return 9;
}

function fontOffset(buf, fontIndex) {
  const tag = buf.toString('latin1', 0, 4);
  if (tag === 'ttcf') {
    const numFonts = buf.readUInt32BE(8);
    if (fontIndex >= numFonts) throw new Error(`font index ${fontIndex} out of ${numFonts}`);
    return buf.readUInt32BE(12 + 4 * fontIndex);
  }
  if (tag === 'OTTO' || tag === 'true' || buf.readUInt32BE(0) === 0x00010000) return 0;
  throw new Error('not an sfnt font (bad header ' + JSON.stringify(tag) + ')');
}

export function readNames(buf, { fontIndex = 0 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) throw new Error('not an sfnt font (too short)');
  const base = fontOffset(buf, fontIndex);
  const numTables = buf.readUInt16BE(base + 4);
  let name = null;
  for (let i = 0; i < numTables; i += 1) {
    const rec = base + 12 + 16 * i;
    if (buf.toString('latin1', rec, rec + 4) === 'name') name = { offset: buf.readUInt32BE(rec + 8), length: buf.readUInt32BE(rec + 12) };
  }
  if (!name) throw new Error('no name table');
  const t = name.offset;
  const count = buf.readUInt16BE(t + 2);
  const storage = t + buf.readUInt16BE(t + 4);
  const best = {};
  for (let i = 0; i < count; i += 1) {
    const p = t + 6 + 12 * i;
    const r = {
      platformID: buf.readUInt16BE(p),
      encodingID: buf.readUInt16BE(p + 2),
      languageID: buf.readUInt16BE(p + 4),
      nameID: buf.readUInt16BE(p + 6),
    };
    const len = buf.readUInt16BE(p + 8);
    const off = storage + buf.readUInt16BE(p + 10);
    if (off + len > buf.length) continue; // a broken record must not abort the scan
    const text = decodeRecord(r, buf.subarray(off, off + len));
    if (text === null) continue;
    const prev = best[r.nameID];
    if (!prev || rank(r) < prev.rank) best[r.nameID] = { rank: rank(r), text };
  }
  const out = {};
  for (const [key, id] of Object.entries(NAME_IDS)) out[key] = best[id] ? best[id].text : null;
  const m = out.version && /(\d+\.\d+)/.exec(out.version);
  out.versionNumber = m ? m[1] : null;
  return out;
}

export function readFontNames(file, opts) {
  return readNames(readFileSync(file), opts);
}
