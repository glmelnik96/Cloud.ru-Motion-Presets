// Unix modes in a zip made on Windows: bsdtar there writes no executable bit, and the Mac launcher of the package
// («Установить (Mac).command») opens with a double click only when it has one. The central directory is patched in
// place: «made by Unix» and the mode in the external attributes of the entries chosen; nothing moves, zip64 included.
import { closeSync, fstatSync, openSync, readSync, writeSync } from 'node:fs';

const EOCD = 0x06054b50;
const EOCD64_LOCATOR = 0x07064b50;
const EOCD64 = 0x06064b50;
const CENTRAL = 0x02014b50;

function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  readSync(fd, b, 0, len, pos);
  return b;
}

// Where the central directory lies: { offset, size, entries }.
export function centralDirectory(fd) {
  const size = fstatSync(fd).size;
  const tailLen = Math.min(size, 65557);
  const tail = readAt(fd, size - tailLen, tailLen);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === EOCD) { at = i; break; }
  if (at < 0) throw new Error('not a zip: no end of central directory');
  let entries = tail.readUInt16LE(at + 10);
  let cdSize = tail.readUInt32LE(at + 12);
  let cdOffset = tail.readUInt32LE(at + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || entries === 0xffff) {
    const loc = at - 20;
    if (loc < 0 || tail.readUInt32LE(loc) !== EOCD64_LOCATOR) throw new Error('zip64 without its locator');
    const rec = readAt(fd, Number(tail.readBigUInt64LE(loc + 8)), 56);
    if (rec.readUInt32LE(0) !== EOCD64) throw new Error('zip64 end of central directory not found');
    entries = Number(rec.readBigUInt64LE(32));
    cdSize = Number(rec.readBigUInt64LE(40));
    cdOffset = Number(rec.readBigUInt64LE(48));
  }
  return { offset: cdOffset, size: cdSize, entries };
}

// setUnixMode(zipFile, (name) => boolean, 0o100755): the entries the test picks get the mode. Returns their names.
export function setUnixMode(zipFile, pick, mode) {
  const fd = openSync(zipFile, 'r+');
  try {
    const cd = centralDirectory(fd);
    const buf = readAt(fd, cd.offset, cd.size);
    const changed = [];
    let p = 0;
    for (let n = 0; n < cd.entries; n++) {
      if (buf.readUInt32LE(p) !== CENTRAL) throw new Error(`central directory entry ${n} broken`);
      const flags = buf.readUInt16LE(p + 8);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const name = buf.subarray(p + 46, p + 46 + nameLen).toString(flags & 0x800 ? 'utf8' : 'latin1');
      if (pick(name)) {
        buf.writeUInt8(3, p + 5); // the high byte of «version made by»: Unix
        buf.writeUInt32LE(((mode & 0xffff) << 16) >>> 0, p + 38);
        changed.push(name);
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    if (changed.length) writeSync(fd, buf, 0, buf.length, cd.offset);
    return changed;
  } finally {
    closeSync(fd);
  }
}

// The names of a zip with their flags: { name, utf8, unix, mode } (tests and the build's own check).
export function listEntries(zipFile) {
  const fd = openSync(zipFile, 'r');
  try {
    const cd = centralDirectory(fd);
    const buf = readAt(fd, cd.offset, cd.size);
    const out = [];
    let p = 0;
    for (let n = 0; n < cd.entries; n++) {
      const flags = buf.readUInt16LE(p + 8);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const utf8 = Boolean(flags & 0x800);
      out.push({ name: buf.subarray(p + 46, p + 46 + nameLen).toString(utf8 ? 'utf8' : 'latin1'), utf8, unix: buf.readUInt8(p + 5) === 3, mode: buf.readUInt32LE(p + 38) >>> 16 });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  } finally {
    closeSync(fd);
  }
}
