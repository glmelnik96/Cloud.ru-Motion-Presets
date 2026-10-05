// The panel's log on disk (spec 8.2): JSON lines in <dir>/brandkit-YYYY-MM-DD.jsonl by the local date. A file
// takes lines while it stays within 5 MB, then the log goes on in brandkit-YYYY-MM-DD.1.jsonl, .2 and so on (a
// single line longer than that gets a part of its own); logs older than 7 days are deleted at start and when the
// day changes. The AE and Premiere panels share the folder, so the size is read from the disk before each append
// rather than counted. Logging is best effort: it never throws.
import { envVar } from './cep';
import type { Env } from './cep';
import { joinPosix } from './files';
import type { Files } from './files';

export const LOG_MAX_BYTES = 5 * 1024 * 1024;
export const LOG_KEEP_DAYS = 7;

const LOG_NAME = /^brandkit-(\d{4})-(\d{2})-(\d{2})(?:\.\d+)?\.jsonl$/;
const MAX_PARTS = 1000; // 5 GB of log a day: past that the last part just grows
const utf8 = new TextEncoder();

export type LogFiles = Pick<Files, 'append' | 'join' | 'mkdirp' | 'readDir' | 'remove' | 'stat'>;

export interface LogSinkOptions {
  files: LogFiles;
  dir: string;
  now?: () => Date;
  maxBytes?: number;
  keepDays?: number;
}

// write works detached, so it can be core/log.ts's sink as is: createLogger(disk.write).
export interface DiskLogSink {
  write(entry: object): void; // queued; flush() waits for the disk
  flush(): Promise<void>; // never rejects
}

export function logDir(env: Env, platform: string, home: string): string {
  if (platform === 'win32') {
    return joinPosix(envVar(env, 'LOCALAPPDATA') ?? joinPosix(home, 'AppData/Local'), 'CloudRuBrandKit/logs');
  }
  return joinPosix(home, 'Library/Logs/CloudRuBrandKit');
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const localDay = (d: Date): string => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
// Calendar days since 1970 for a local date; UTC arithmetic keeps daylight saving out of it.
const dayIndex = (y: number, m: number, d: number): number => Math.round(Date.UTC(y, m - 1, d) / 86400000);

export function createLogSink(options: LogSinkOptions): DiskLogSink {
  const { files, dir, now = () => new Date(), maxBytes = LOG_MAX_BYTES, keepDays = LOG_KEEP_DAYS } = options;
  let day = '';
  let part = 0;
  let queue: string[] = [];
  let scheduled = false;

  const fileOf = (d: string, p: number): string => files.join(dir, 'brandkit-' + d + (p ? '.' + p : '') + '.jsonl');

  async function cleanup(): Promise<void> {
    const t = now();
    const today = dayIndex(t.getFullYear(), t.getMonth() + 1, t.getDate());
    for (const entry of await files.readDir(dir)) {
      const m = LOG_NAME.exec(entry.name);
      if (!m || entry.dir) continue;
      if (today - dayIndex(Number(m[1]), Number(m[2]), Number(m[3])) <= keepDays) continue;
      await files.remove(files.join(dir, entry.name)).catch(() => undefined);
    }
  }

  // The first part of the day that is empty or takes `need` more bytes within the limit, and the room left in
  // it. Parts only grow within a day; the last one takes everything.
  async function target(need: number): Promise<{ file: string; room: number }> {
    const d = localDay(now());
    if (d !== day) {
      if (day) await cleanup().catch(() => undefined);
      day = d;
      part = 0;
    }
    for (; part < MAX_PARTS - 1; part += 1) {
      const size = (await files.stat(fileOf(day, part)))?.size ?? 0;
      if (size === 0 || size + need <= maxBytes) return { file: fileOf(day, part), room: maxBytes - size };
    }
    return { file: fileOf(day, part), room: Infinity };
  }

  async function append(file: string, text: string): Promise<void> {
    try {
      await files.append(file, text);
    } catch {
      await files.mkdirp(dir); // the folder went away under the panel
      await files.append(file, text);
    }
  }

  // One append per part the batch reaches: a burst written in one tick must not take a part past the limit either.
  async function drain(): Promise<void> {
    scheduled = false;
    const batch = queue;
    queue = [];
    let at = { file: '', room: 0 };
    let chunk = '';
    try {
      for (const text of batch) {
        const bytes = utf8.encode(text).length; // the limit is about the size on disk
        if (!chunk || bytes > at.room) {
          if (chunk) await append(at.file, chunk);
          at = await target(bytes);
          chunk = '';
        }
        chunk += text;
        at.room -= bytes;
      }
      if (chunk) await append(at.file, chunk);
    } catch {
      // Best effort: a log that cannot be written must not break the panel.
    }
  }

  function line(entry: object): string {
    try {
      const json = JSON.stringify(entry);
      return typeof json === 'string' ? json + '\n' : '';
    } catch (e) {
      return JSON.stringify({ ts: now().toISOString(), level: 'error', code: 'LOG_UNSERIALIZABLE', msg: String(e) }) + '\n';
    }
  }

  const ready = (async () => {
    await files.mkdirp(dir);
    day = localDay(now());
    await cleanup();
  })().catch(() => undefined);
  let tail: Promise<void> = ready;

  return {
    write(entry) {
      try {
        const text = line(entry);
        if (!text) return;
        queue.push(text);
        if (!scheduled) {
          scheduled = true;
          tail = tail.then(drain);
        }
      } catch {
        // Never into the caller.
      }
    },
    flush: () => tail,
  };
}
