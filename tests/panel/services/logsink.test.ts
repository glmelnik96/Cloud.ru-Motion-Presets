import { afterAll, describe, it, expect } from 'vitest';
import { createFiles, posixPath } from '../../../panel/src/services/files';
import { createLogSink, logDir, LOG_KEEP_DAYS, LOG_MAX_BYTES } from '../../../panel/src/services/logsink';
import type { LogFiles } from '../../../panel/src/services/logsink';

// The panel tsconfig has no Node types (types: []); the tests run in Node, so the built-ins come in untyped.
const nodeModule = 'node:module';
const { createRequire } = (await import(nodeModule)) as { createRequire(url: string): (id: string) => any };
const req = createRequire(import.meta.url);
const fs = req('fs');
const os = req('os');
const nodePath = req('path');

const made: string[] = [];
const tmp = (): string => {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'crbk-log-'));
  made.push(dir);
  return posixPath(dir);
};
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

const files = createFiles(req);
const day = (y: number, m: number, d: number, h = 12): Date => new Date(y, m - 1, d, h, 0, 0);
const lines = (file: string): unknown[] =>
  String(fs.readFileSync(file, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
const names = (dir: string): string[] => fs.readdirSync(dir).sort();
// The parts of a day in order: the file of the day, then .1, .2 and so on while they exist.
const partsOf = (dir: string, d: string): string[] => {
  const out: string[] = [];
  for (let p = 0; ; p += 1) {
    const file = dir + '/brandkit-' + d + (p ? '.' + p : '') + '.jsonl';
    if (!fs.existsSync(file)) return out;
    out.push(file);
  }
};
const sizeOf = (file: string): number => fs.statSync(file).size;

describe('log sink', () => {
  it('writes one JSON line per entry into the file of the local day', async () => {
    const dir = tmp() + '/CloudRuBrandKit/logs';
    const sink = createLogSink({ files, dir, now: () => day(2026, 10, 5, 0) });
    sink.write({ ts: '2026-10-05T00:00:00.000Z', level: 'info', code: 'START', msg: 'Панель открыта' });
    sink.write({ ts: '2026-10-05T00:00:01.000Z', level: 'error', code: 'TIMEOUT', data: { fn: 'insertItem', text: 'a\nb' } });
    await sink.flush();
    expect(names(dir)).toEqual(['brandkit-2026-10-05.jsonl']);
    const text = String(fs.readFileSync(dir + '/brandkit-2026-10-05.jsonl', 'utf8'));
    expect(text.split('\n')).toHaveLength(3); // two lines and the final newline
    expect(lines(dir + '/brandkit-2026-10-05.jsonl')).toEqual([
      { ts: '2026-10-05T00:00:00.000Z', level: 'info', code: 'START', msg: 'Панель открыта' },
      { ts: '2026-10-05T00:00:01.000Z', level: 'error', code: 'TIMEOUT', data: { fn: 'insertItem', text: 'a\nb' } },
    ]);
  });

  it('works with write handed on alone, as the core logger takes it', async () => {
    const dir = tmp();
    const sink = createLogSink({ files, dir, now: () => day(2026, 10, 5) });
    const write: (entry: { ts: string; level: 'info'; code: string; msg: string }) => void = sink.write;
    write({ ts: '2026-10-05T09:00:00.000Z', level: 'info', code: 'READY', msg: 'ok' });
    await sink.flush();
    expect(lines(dir + '/brandkit-2026-10-05.jsonl')).toEqual([{ ts: '2026-10-05T09:00:00.000Z', level: 'info', code: 'READY', msg: 'ok' }]);
  });

  it('keeps the order of many entries written without waiting', async () => {
    const dir = tmp();
    const sink = createLogSink({ files, dir, now: () => day(2026, 10, 5) });
    for (let i = 0; i < 50; i += 1) sink.write({ i });
    await sink.flush();
    for (let i = 50; i < 60; i += 1) sink.write({ i });
    await sink.flush();
    expect(lines(dir + '/brandkit-2026-10-05.jsonl')).toEqual(Array.from({ length: 60 }, (_, i) => ({ i })));
  });

  it('starts a new file when the day changes', async () => {
    const dir = tmp();
    let now = day(2026, 10, 5, 23);
    const sink = createLogSink({ files, dir, now: () => now });
    sink.write({ n: 1 });
    await sink.flush();
    now = day(2026, 10, 6, 0);
    sink.write({ n: 2 });
    await sink.flush();
    expect(names(dir)).toEqual(['brandkit-2026-10-05.jsonl', 'brandkit-2026-10-06.jsonl']);
    expect(lines(dir + '/brandkit-2026-10-06.jsonl')).toEqual([{ n: 2 }]);
  });

  it('continues in .1, .2 when the next line would take the file of the day past the size limit', async () => {
    const dir = tmp();
    const sink = createLogSink({ files, dir, now: () => day(2026, 10, 5), maxBytes: 64 });
    for (let i = 0; i < 5; i += 1) {
      sink.write({ n: i, pad: 'x'.repeat(15) }); // 32 bytes with the newline: two fill a part exactly
      await sink.flush();
    }
    expect(names(dir)).toEqual(['brandkit-2026-10-05.1.jsonl', 'brandkit-2026-10-05.2.jsonl', 'brandkit-2026-10-05.jsonl']);
    expect(lines(dir + '/brandkit-2026-10-05.jsonl').map((e: any) => e.n)).toEqual([0, 1]);
    expect(lines(dir + '/brandkit-2026-10-05.1.jsonl').map((e: any) => e.n)).toEqual([2, 3]);
    expect(lines(dir + '/brandkit-2026-10-05.2.jsonl').map((e: any) => e.n)).toEqual([4]);
    const big = tmp();
    const sink2 = createLogSink({ files, dir: big, now: () => day(2026, 10, 5), maxBytes: 64 });
    for (let i = 0; i < 3; i += 1) {
      sink2.write({ n: i, pad: 'x'.repeat(24) }); // 41 bytes: a second one would make 82
      await sink2.flush();
    }
    expect(partsOf(big, '2026-10-05').map((f) => lines(f).map((e: any) => e.n))).toEqual([[0], [1], [2]]);
  });

  it('splits a burst written in one tick, so no part passes the size limit', async () => {
    const dir = tmp();
    const sink = createLogSink({ files, dir, now: () => day(2026, 10, 5), maxBytes: 100 });
    const want = Array.from({ length: 40 }, (_, i) => ({ i, pad: 'x'.repeat(i % 7) }));
    for (const entry of want) sink.write(entry); // one batch of 825 bytes
    await sink.flush();
    const parts = partsOf(dir, '2026-10-05');
    expect(parts.length).toBeGreaterThanOrEqual(9);
    for (const part of parts) expect(sizeOf(part)).toBeLessThanOrEqual(100);
    expect(parts.flatMap((part) => lines(part))).toEqual(want);
  });

  it('keeps the default 5 MB limit for a burst of several megabytes', async () => {
    const dir = tmp();
    const sink = createLogSink({ files, dir, now: () => day(2026, 10, 5) });
    const pad = 'x'.repeat(380);
    for (let i = 0; i < 15000; i += 1) sink.write({ i, pad }); // about 6 MB in one tick
    await sink.flush();
    const parts = partsOf(dir, '2026-10-05');
    expect(parts).toHaveLength(2);
    expect(sizeOf(parts[0]!)).toBeLessThanOrEqual(LOG_MAX_BYTES);
    expect(sizeOf(parts[0]!)).toBeGreaterThan(LOG_MAX_BYTES - 500); // filled, not rolled early
    expect(parts.flatMap((part) => lines(part).map((e: any) => e.i))).toEqual(Array.from({ length: 15000 }, (_, i) => i));
  });

  it('puts a line longer than the size limit alone into a part of its own', async () => {
    const dir = tmp();
    const sink = createLogSink({ files, dir, now: () => day(2026, 10, 5), maxBytes: 64 });
    sink.write({ n: 0 });
    sink.write({ n: 1, pad: 'x'.repeat(100) });
    sink.write({ n: 2 });
    await sink.flush();
    expect(partsOf(dir, '2026-10-05').map((f) => lines(f).map((e: any) => e.n))).toEqual([[0], [1], [2]]);
  });

  it('counts the size limit in UTF-8 bytes, as the file grows on disk', async () => {
    const dir = tmp();
    const sink = createLogSink({ files, dir, now: () => day(2026, 10, 5), maxBytes: 40 });
    sink.write({ m: 'Ж'.repeat(10) }); // 19 characters, 29 bytes
    sink.write({ m: 'Ж'.repeat(10) });
    await sink.flush();
    expect(partsOf(dir, '2026-10-05').map(sizeOf)).toEqual([29, 29]);
  });

  it('stops rolling at part 999 and lets the last part grow', async () => {
    let stats = 0;
    const appended: string[] = [];
    // Fakes only: every part reports full, and nothing reaches the disk.
    const full: LogFiles = {
      join: files.join,
      mkdirp: async () => undefined,
      readDir: async () => [],
      remove: async () => undefined,
      stat: async () => ((stats += 1), { size: 64, mtimeMs: 0, isFile: true, isDir: false }),
      append: async (file) => {
        appended.push(file.slice(file.lastIndexOf('/') + 1));
      },
    };
    const sink = createLogSink({ files: full, dir: '/logs', now: () => day(2026, 10, 5), maxBytes: 64 });
    sink.write({ n: 1 });
    await sink.flush();
    sink.write({ n: 2 });
    await sink.flush();
    expect(appended).toEqual(['brandkit-2026-10-05.999.jsonl', 'brandkit-2026-10-05.999.jsonl']);
    expect(stats).toBe(999); // parts 0 to 998 once; the last part is not looked at again
  });

  it('picks up a full file of the day left by an earlier session or the other host', async () => {
    const dir = tmp();
    fs.writeFileSync(dir + '/brandkit-2026-10-05.jsonl', 'x'.repeat(100) + '\n');
    fs.writeFileSync(dir + '/brandkit-2026-10-05.1.jsonl', '{"old":1}\n');
    const sink = createLogSink({ files, dir, now: () => day(2026, 10, 5), maxBytes: 64 });
    sink.write({ n: 1 });
    await sink.flush();
    expect(lines(dir + '/brandkit-2026-10-05.1.jsonl')).toEqual([{ old: 1 }, { n: 1 }]);
  });

  it('deletes its logs older than seven days when it starts', async () => {
    const dir = tmp();
    for (const name of [
      'brandkit-2026-09-01.jsonl',
      'brandkit-2026-09-27.jsonl',
      'brandkit-2026-09-27.3.jsonl',
      'brandkit-2026-09-28.jsonl',
      'brandkit-2026-10-04.1.jsonl',
      'brandkit-2026-10-05.jsonl',
      'brandkit-notes.jsonl',
      'other-2026-01-01.jsonl',
      'readme.txt',
    ]) fs.writeFileSync(dir + '/' + name, '{}\n');
    const sink = createLogSink({ files, dir, now: () => day(2026, 10, 5, 1) });
    await sink.flush();
    expect(names(dir)).toEqual([
      'brandkit-2026-09-28.jsonl',
      'brandkit-2026-10-04.1.jsonl',
      'brandkit-2026-10-05.jsonl',
      'brandkit-notes.jsonl',
      'other-2026-01-01.jsonl',
      'readme.txt',
    ]);
  });

  it('deletes the logs that pass seven days when the day changes while it runs', async () => {
    const dir = tmp();
    for (const name of ['brandkit-2026-09-28.jsonl', 'brandkit-2026-09-28.2.jsonl', 'brandkit-2026-09-30.jsonl']) {
      fs.writeFileSync(dir + '/' + name, '{}\n');
    }
    let now = day(2026, 10, 5);
    const sink = createLogSink({ files, dir, now: () => now });
    sink.write({ n: 1 });
    await sink.flush();
    // Seven days old at the start: kept.
    expect(names(dir)).toEqual(['brandkit-2026-09-28.2.jsonl', 'brandkit-2026-09-28.jsonl', 'brandkit-2026-09-30.jsonl', 'brandkit-2026-10-05.jsonl']);
    now = day(2026, 10, 7);
    sink.write({ n: 2 });
    await sink.flush();
    expect(names(dir)).toEqual(['brandkit-2026-09-30.jsonl', 'brandkit-2026-10-05.jsonl', 'brandkit-2026-10-07.jsonl']);
  });

  it('recreates its folder when the folder disappears', async () => {
    const dir = tmp() + '/logs';
    const sink = createLogSink({ files, dir, now: () => day(2026, 10, 5) });
    sink.write({ n: 1 });
    await sink.flush();
    fs.rmSync(dir, { recursive: true, force: true });
    sink.write({ n: 2 });
    await sink.flush();
    expect(lines(dir + '/brandkit-2026-10-05.jsonl')).toEqual([{ n: 2 }]);
  });

  it('never throws into the caller', async () => {
    const fail = async (): Promise<never> => {
      throw new Error('disk gone');
    };
    // Fakes for every call that touches the disk (join only builds a string), so neither sink can create
    // Z:\nowhere, or a 'Z:' folder in the working directory on a Mac.
    const broken: LogFiles = { join: files.join, mkdirp: fail, readDir: fail, remove: fail, stat: fail, append: fail };
    const sink = createLogSink({ files: broken, dir: 'Z:/nowhere', now: () => day(2026, 10, 5) });
    expect(() => sink.write({ n: 1 })).not.toThrow();
    await expect(sink.flush()).resolves.toBeUndefined();
    let joins = 0;
    const throwing: LogFiles = {
      ...broken,
      join: () => {
        joins += 1;
        throw new Error('bad path');
      },
    };
    const sink2 = createLogSink({ files: throwing, dir: 'Z:/nowhere', now: () => day(2026, 10, 5) });
    expect(() => sink2.write({ n: 1 })).not.toThrow();
    await expect(sink2.flush()).resolves.toBeUndefined();
    expect(joins).toBeGreaterThan(0); // the throw happened inside the sink, not before it
  });

  it('writes a marker line for an entry that is not JSON', async () => {
    const dir = tmp();
    const sink = createLogSink({ files, dir, now: () => day(2026, 10, 5) });
    const loop: Record<string, unknown> = { code: 'X' };
    loop.self = loop;
    expect(() => sink.write(loop)).not.toThrow();
    sink.write({ n: 2 });
    await sink.flush();
    const got = lines(dir + '/brandkit-2026-10-05.jsonl') as Record<string, unknown>[];
    expect(got).toHaveLength(2);
    expect(got[0]).toMatchObject({ level: 'error', code: 'LOG_UNSERIALIZABLE' });
    expect(got[1]).toEqual({ n: 2 });
  });

  it('rotates at 5 MB and keeps seven days by default', () => {
    expect(LOG_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(LOG_KEEP_DAYS).toBe(7);
  });

  it('puts the logs in LOCALAPPDATA on Windows and in ~/Library/Logs on macOS', () => {
    expect(logDir({ LOCALAPPDATA: 'C:\\Users\\Глеб\\AppData\\Local' }, 'win32', 'C:\\Users\\Глеб'))
      .toBe('C:/Users/Глеб/AppData/Local/CloudRuBrandKit/logs');
    expect(logDir({ localappdata: 'D:\\Profiles\\u\\Local\\' }, 'win32', 'C:\\Users\\u')).toBe('D:/Profiles/u/Local/CloudRuBrandKit/logs');
    expect(logDir({}, 'win32', 'C:\\Users\\u')).toBe('C:/Users/u/AppData/Local/CloudRuBrandKit/logs');
    expect(logDir({}, 'darwin', '/Users/gleb')).toBe('/Users/gleb/Library/Logs/CloudRuBrandKit');
  });
});
