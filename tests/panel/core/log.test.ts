import { describe, it, expect } from 'vitest';
import { createLogger, type LogEntry } from '../../../panel/src/core/log';

const at = (iso: string) => () => new Date(iso);

describe('createLogger', () => {
  it('writes {ts, level, code, msg, data} to the injected sink', () => {
    const entries: LogEntry[] = [];
    const log = createLogger((e) => entries.push(e), at('2026-10-05T10:20:30.400Z'));
    log.info('INSERT_START', 'insert TTL_LowerThird@1 16x9', { host: 'pr', name: 'Анна-Мария Ёлкина' });
    log.warn('READBACK_MISMATCH', 'fields did not read back', { fields: ['Имя'] });
    log.error('TIMEOUT', 'insertItem timed out');
    const ts = '2026-10-05T10:20:30.400Z';
    expect(entries).toEqual([
      { ts, level: 'info', code: 'INSERT_START', msg: 'insert TTL_LowerThird@1 16x9', data: { host: 'pr', name: 'Анна-Мария Ёлкина' } },
      { ts, level: 'warn', code: 'READBACK_MISMATCH', msg: 'fields did not read back', data: { fields: ['Имя'] } },
      { ts, level: 'error', code: 'TIMEOUT', msg: 'insertItem timed out' },
    ]);
    expect('data' in entries[2]!).toBe(false);
  });
  it('reads the clock for every entry', () => {
    const entries: LogEntry[] = [];
    let t = Date.parse('2026-10-05T00:00:00.000Z');
    const log = createLogger((e) => entries.push(e), () => new Date((t += 1000)));
    log.info('A', 'a');
    log.info('B', 'b');
    expect(entries.map((e) => e.ts)).toEqual(['2026-10-05T00:00:01.000Z', '2026-10-05T00:00:02.000Z']);
  });
  it('never lets a broken sink or clock break the caller', () => {
    const throwing = createLogger(() => {
      throw new Error('disk full');
    }, at('2026-10-05T00:00:00Z'));
    expect(() => throwing.error('X', 'y')).not.toThrow();
    const badClock = createLogger(() => {}, () => new Date(Number.NaN));
    expect(() => badClock.info('X', 'y')).not.toThrow();
  });
});
