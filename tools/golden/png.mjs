// PNG checks for golden frames. saveFrameToPng returns before the file is on disk (ae-quirks #27,
// #40, #50, #99): a frame counts only when it ends with the IEND chunk and its size has stopped changing.
import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs';

const SIGNATURE = '89504e470d0a1a0a';
const IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function readAt(file, length, from) {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const buf = Buffer.alloc(length);
    const pos = from === 'end' ? size - length : from;
    if (pos < 0) return null;
    readSync(fd, buf, 0, length, pos);
    return buf;
  } finally {
    closeSync(fd);
  }
}

export function pngSize(file) {
  const b = readAt(file, 24, 0);
  if (!b || b.subarray(0, 8).toString('hex') !== SIGNATURE || b.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('NOT_PNG: ' + file);
  }
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

export function pngComplete(file) {
  try {
    const tail = readAt(file, 12, 'end');
    return Boolean(tail) && tail.equals(IEND);
  } catch {
    return false; // not there yet, or still locked by the writer
  }
}

const sizeOf = (f) => { try { return statSync(f).size; } catch { return -1; } };

// Resolves when every file is complete and kept its size between two polls. Never re-reads a
// half-written file as done (quirk #50). onProgress(doneCount, total) is called on every poll.
export async function waitForStableFiles(files, { timeoutMs = 600000, intervalMs = 2000, complete = pngComplete, onProgress } = {}) {
  const start = Date.now();
  let prev = null;
  for (;;) {
    const sizes = files.map(sizeOf);
    const done = files.map((f, i) => sizes[i] > 0 && prev !== null && sizes[i] === prev[i] && complete(f));
    const n = done.filter(Boolean).length;
    if (onProgress) onProgress(n, files.length);
    if (n === files.length) return sizes;
    if (Date.now() - start > timeoutMs) {
      const pending = files.filter((f, i) => !done[i]);
      throw new Error(`WAIT_TIMEOUT: ${pending.length} of ${files.length} file(s) not complete after ${timeoutMs} ms, first: ${pending[0]}`);
    }
    prev = sizes;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
