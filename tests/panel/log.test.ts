import { describe, expect, it } from 'vitest';
import { Logger, type LogFs } from '../../panel/src/core/log';

function fakeFs(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const fs: LogFs & { files: Map<string, string> } = {
    files,
    mkdirp() {},
    append(file, text) { files.set(file, (files.get(file) ?? '') + text); },
    list(dir) {
      return [...files.keys()].filter((f) => f.startsWith(dir + '/')).map((f) => ({ name: f.slice(dir.length + 1), bytes: files.get(f)!.length }));
    },
    remove(file) { files.delete(file); },
  };
  return fs;
}

const DIR = 'C:/logs';

describe('logger', () => {
  it('writes JSON lines into the file of the day', () => {
    const fs = fakeFs();
    const log = new Logger(fs, DIR, () => new Date(2026, 9, 5, 12, 0, 0));
    log.info('insert', { id: 'LOGO_Shot' });
    log.error('readback', { fields: ['name'] });
    const lines = fs.files.get(`${DIR}/brandkit-2026-10-05.jsonl`)!.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => [l.level, l.event])).toEqual([['info', 'insert'], ['error', 'readback']]);
    expect(lines[0].id).toBe('LOGO_Shot');
  });

  it('removes files older than 7 days and keeps others', () => {
    const fs = fakeFs({
      [`${DIR}/brandkit-2026-09-27.jsonl`]: 'x',
      [`${DIR}/brandkit-2026-09-28.jsonl`]: 'x',
      [`${DIR}/brandkit-2026-09-29.jsonl`]: 'x',
      [`${DIR}/notes.txt`]: 'mine',
    });
    new Logger(fs, DIR, () => new Date(2026, 9, 5, 12)).info('start');
    expect([...fs.files.keys()].sort()).toEqual([
      `${DIR}/brandkit-2026-09-29.jsonl`, `${DIR}/brandkit-2026-10-05.jsonl`, `${DIR}/notes.txt`,
    ]);
  });

  it('keeps the logs within the byte budget, oldest first, and continues a full day in a new part', () => {
    const fs = fakeFs({
      [`${DIR}/brandkit-2026-10-03.jsonl`]: 'a'.repeat(60),
      [`${DIR}/brandkit-2026-10-04.jsonl`]: 'b'.repeat(30),
      [`${DIR}/brandkit-2026-10-05.jsonl`]: 'c'.repeat(25),
    });
    new Logger(fs, DIR, () => new Date(2026, 9, 5, 12), { days: 7, bytes: 100 }).info('e');
    expect(fs.files.has(`${DIR}/brandkit-2026-10-03.jsonl`)).toBe(false);
    expect(fs.files.get(`${DIR}/brandkit-2026-10-05.jsonl`)).toBe('c'.repeat(25));
    expect(fs.files.get(`${DIR}/brandkit-2026-10-05.1.jsonl`)).toMatch(/"event":"e"/);
  });

  it('never throws', () => {
    const broken: LogFs = { mkdirp() { throw new Error('denied'); }, append() {}, list() { return []; }, remove() {} };
    expect(() => new Logger(broken, DIR).warn('x')).not.toThrow();
  });
});
