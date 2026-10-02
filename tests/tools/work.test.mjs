import { describe, it, expect } from 'vitest';
import { workDir, workPath, assertAscii } from '../../tools/lib/work.mjs';

describe('work', () => {
  it('defaults to C:/CRBK/work on Windows', () => {
    expect(workDir({}, 'win32')).toBe('C:/CRBK/work');
  });
  it('defaults to /Users/Shared/CRBK/work on macOS', () => {
    expect(workDir({}, 'darwin')).toBe('/Users/Shared/CRBK/work');
  });
  it('honours BRANDKIT_WORK and normalises slashes', () => {
    expect(workDir({ BRANDKIT_WORK: 'D:\\tmp\\bk' }, 'win32')).toBe('D:/tmp/bk');
  });
  it('rejects non-ASCII paths', () => {
    expect(() => assertAscii('C:/Users/Глеб/x')).toThrow(/ASCII/);
  });
  it('joins parts under the working folder', () => {
    const saved = process.env.BRANDKIT_WORK;
    process.env.BRANDKIT_WORK = 'D:\\tmp\\bk';
    try {
      expect(workPath('fixtures', 'media')).toBe('D:/tmp/bk/fixtures/media');
    } finally {
      if (saved === undefined) delete process.env.BRANDKIT_WORK; else process.env.BRANDKIT_WORK = saved;
    }
  });
});
