// Builds a minimal sfnt font in memory for tests: offset table, one table record ('name') and a
// format-0 name table. `base` shifts table offsets when the font sits inside a TTC collection.
export function utf16be(text) {
  return Buffer.from(text, 'utf16le').swap16();
}

export function makeFont({ sfnt = 'OTTO', names = [], base = 0 } = {}) {
  const records = names.map((n) => ({
    ...n,
    bytes: n.bytes || (n.platformID === 1 ? Buffer.from(n.text, 'latin1') : utf16be(n.text)),
  }));
  const header = 6 + 12 * records.length;
  const storage = Buffer.concat(records.map((r) => r.bytes));
  const name = Buffer.alloc(header + storage.length);
  name.writeUInt16BE(0, 0); // format 0
  name.writeUInt16BE(records.length, 2);
  name.writeUInt16BE(header, 4); // offset of the string storage
  let off = 0;
  records.forEach((r, i) => {
    const p = 6 + 12 * i;
    name.writeUInt16BE(r.platformID, p);
    name.writeUInt16BE(r.encodingID, p + 2);
    name.writeUInt16BE(r.languageID, p + 4);
    name.writeUInt16BE(r.nameID, p + 6);
    name.writeUInt16BE(r.bytes.length, p + 8);
    name.writeUInt16BE(off, p + 10);
    off += r.bytes.length;
  });
  storage.copy(name, header);
  const dir = Buffer.alloc(12 + 16);
  if (sfnt === 'OTTO') dir.write('OTTO', 0, 'latin1');
  else dir.writeUInt32BE(0x00010000, 0);
  dir.writeUInt16BE(1, 4); // numTables
  dir.write('name', 12, 'latin1');
  dir.writeUInt32BE(0, 16); // checksum, not checked by the reader
  dir.writeUInt32BE(base + 28, 20); // offset of the name table from the start of the file
  dir.writeUInt32BE(name.length, 24);
  return Buffer.concat([dir, name]);
}

export function makeTtc(font) {
  const head = Buffer.alloc(16);
  head.write('ttcf', 0, 'latin1');
  head.writeUInt32BE(0x00010000, 4);
  head.writeUInt32BE(1, 8); // numFonts
  head.writeUInt32BE(16, 12); // offset of font 0
  return Buffer.concat([head, font]);
}

export const win = (nameID, text, languageID = 0x0409) => ({ platformID: 3, encodingID: 1, languageID, nameID, text });
export const mac = (nameID, text) => ({ platformID: 1, encodingID: 0, languageID: 0, nameID, text });
export const sbFont = (postScriptName, version) =>
  makeFont({ names: [win(1, 'SB Sans'), win(5, 'Version ' + version), win(6, postScriptName)] });
