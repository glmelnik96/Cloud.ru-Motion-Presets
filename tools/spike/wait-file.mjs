// Waiting for files that another process writes (AE MOGRT export, AME encodes, renders).
// A host call that returned is no proof the bytes are on disk (ae-quirks #27, #40, #50): gate on the file.
// Shared helper: S2 and S10 use it, and the spikes of parts C, D and E import these waits instead of
// writing their own.
import { statSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function statOrNull(p) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

// Resolves when `file` exists, is non-empty, is newer than sinceMs and its size and mtime have not
// changed for stableMs. Never throws on timeout: { ok: false, reason: 'missing' | 'not updated' | 'not stable' }.
export async function waitStableFile(file, { stableMs = 2000, timeoutMs = 120000, intervalMs = 250, sinceMs = 0 } = {}) {
  const t0 = Date.now();
  let sig = null;
  let since = 0;
  for (;;) {
    const st = statOrNull(file);
    const now = Date.now();
    if (st && st.size > 0 && st.mtimeMs > sinceMs) {
      const s = st.size + ':' + st.mtimeMs;
      if (s !== sig) {
        sig = s;
        since = now;
      } else if (now - since >= stableMs) {
        return { ok: true, file, size: st.size, mtimeMs: st.mtimeMs, waitedMs: now - t0 };
      }
    }
    if (now - t0 >= timeoutMs) {
      let reason = 'missing';
      if (st) reason = st.mtimeMs > sinceMs && st.size > 0 ? 'not stable' : 'not updated';
      return { ok: false, file, reason, size: st ? st.size : 0, waitedMs: now - t0 };
    }
    await sleep(intervalMs);
  }
}

// Files under dir (recursive) with one of exts (lower case, with the dot), modified after sinceMs.
export function findNewFiles(dir, { exts = [], sinceMs = 0 } = {}) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (exts.length && !exts.includes(path.extname(e.name).toLowerCase())) continue;
      const st = statOrNull(p);
      if (st && st.mtimeMs > sinceMs) out.push(p.replace(/\\/g, '/'));
    }
  };
  walk(dir);
  return out.sort();
}

// Waits for at least one new file under dir, then until every new file is stable.
export async function waitNewStableFiles(dir, { exts = [], sinceMs = 0, stableMs = 5000, timeoutMs = 600000, intervalMs = 1000 } = {}) {
  const t0 = Date.now();
  let found = [];
  while (Date.now() - t0 < timeoutMs) {
    found = findNewFiles(dir, { exts, sinceMs });
    if (found.length) break;
    await sleep(intervalMs);
  }
  if (!found.length) return { ok: false, reason: 'no new file', files: [], waitedMs: Date.now() - t0 };
  const files = [];
  for (const f of found) {
    const left = Math.max(stableMs + intervalMs, timeoutMs - (Date.now() - t0));
    files.push(await waitStableFile(f, { stableMs, timeoutMs: left, intervalMs, sinceMs }));
  }
  return { ok: files.every((r) => r.ok), files, waitedMs: Date.now() - t0 };
}
