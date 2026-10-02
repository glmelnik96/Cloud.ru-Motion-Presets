import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  S8_PACKS, relinkedAep, prPaths, nameVariants, sequencePlan, realtimeFactor,
  mergeMeasurements, summaryLines, waitValidFile, playbackCheck,
} from '../../spikes/s8-perf/lib.mjs';

describe('S8 helpers', () => {
  it('finds the relinked copies of plan 2 next to the work folder', () => {
    expect(relinkedAep('podcast', {}, 'win32')).toBe('C:/CRBK/packs/podcast/podcast_relinked.aep');
    expect(relinkedAep('smm', { BRANDKIT_WORK: 'D:\\bk\\work' }, 'win32')).toBe('D:/bk/packs/smm/smm_relinked.aep');
    expect(relinkedAep('podcast', {}, 'darwin')).toBe('/Users/Shared/CRBK/packs/podcast/podcast_relinked.aep');
  });
  it('builds Premiere preset paths per platform', () => {
    const w = prPaths({}, 'win32');
    expect(w.presets.FHD).toBe('C:/Program Files/Adobe/Adobe Premiere Pro 2026/Settings/SequencePresets/HD 1080p/HD 1080p 25 fps.sqpreset');
    expect(w.exportPreset).toMatch(/3F3F3F3F_4D6F6F56\/Apple ProRes 422 LT\.epr$/);
    expect(prPaths({ BRANDKIT_PR_ROOT: 'E:\\Pr' }, 'win32').presets.UHD).toBe('E:/Pr/Settings/SequencePresets/UHD (4K)/UHD (4K) 2160p 25 fps.sqpreset');
  });
  it('gives NFC and NFD forms of a name only when they differ', () => {
    expect(nameVariants('Оверлей')).toHaveLength(2);
    expect(nameVariants('BG_pattern_1x1_2')).toEqual(['BG_pattern_1x1_2']);
    expect(S8_PACKS.map((p) => p.slug)).toEqual(['podcast', 'webinars', 'smm']);
  });
  it('plans one sequence per element and size plus two baselines', () => {
    expect(sequencePlan().map((s) => s.name)).toEqual([
      'S8_podcast_FHD', 'S8_podcast_UHD', 'S8_webinars_FHD', 'S8_webinars_UHD',
      'S8_smm_FHD', 'S8_smm_UHD', 'S8_base_FHD', 'S8_base_UHD',
    ]);
  });
  it('computes the real-time factor', () => {
    expect(realtimeFactor(10, 40000)).toBe(0.25);
    expect(realtimeFactor(10, 0)).toBe(null);
  });
  it('merges measurements deeply and replaces arrays', () => {
    expect(mergeMeasurements({ a: { b: 1, c: 2 }, l: [1] }, { a: { c: 3, d: 4 }, l: [2], e: 5 }))
      .toEqual({ a: { b: 1, c: 3, d: 4 }, l: [2], e: 5 });
  });
  it('prints one summary line per sequence', () => {
    const lines = summaryLines({ pr: { inserts: { S8_podcast_FHD: { wallMs: 8200, order: 1 } }, exports: { S8_podcast_FHD: { wallMs: 40000, realtime: 0.25 } } } });
    expect(lines).toHaveLength(8);
    expect(lines[0]).toContain('insert 8.2 s (first MOGRT in project)');
    expect(lines[0]).toContain('0.25x real time');
    expect(lines[7]).toContain('insert -');
  });
  it('turns a playback observation into an optional check', () => {
    expect(playbackCheck({ host: 'PC1', seq: 'S8_smm_UHD', res: '1/2', dropped: '0' }))
      .toEqual({ name: 'pr@PC1: playback S8_smm_UHD 1/2 without dropped frames', pass: true, required: false, detail: 'dropped 0 of 250 frames' });
    expect(playbackCheck({ host: 'PC1', seq: 'S8_podcast_FHD', res: 'Full', dropped: '17' }).pass).toBe(false);
    expect(() => playbackCheck({ host: 'PC1', seq: 'S8_x_FHD', res: 'Full', dropped: '0' })).toThrow(/unknown sequence/);
    expect(() => playbackCheck({ host: 'PC1', seq: 'S8_smm_FHD', res: '1/4', dropped: '0' })).toThrow(/Full or 1\/2/);
    expect(() => playbackCheck({ host: 'PC1', seq: 'S8_smm_FHD', res: 'Full', dropped: 'many' })).toThrow(/whole number/);
  });
  it('waits for a stable file that validates, also after an invalid version', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    const f = path.join(dir, 'a.mogrt');
    writeFileSync(f, 'part');
    const past = new Date(Date.now() - 60000);
    utimesSync(f, past, past);
    const validate = (p) => (readFileSync(p, 'utf8') === 'done' ? { ok: true, detail: 'zip ok' } : { ok: false, detail: 'no definition.json' });
    setTimeout(() => writeFileSync(f, 'done'), 100);
    const r = await waitValidFile(f, { validate, stableMs: 20, intervalMs: 5, timeoutMs: 3000 });
    expect(r).toMatchObject({ ok: true, bytes: 4, detail: 'zip ok' });
    expect(r.ms).toBeGreaterThan(0);
    const stuck = await waitValidFile(f, { validate: () => ({ ok: false, detail: 'no definition.json' }), stableMs: 20, intervalMs: 5, timeoutMs: 200 });
    expect(stuck).toMatchObject({ ok: false, ms: null });
    expect(stuck.detail).toContain('stable but invalid: no definition.json');
    const miss = await waitValidFile(path.join(dir, 'none.mogrt'), { stableMs: 20, intervalMs: 5, timeoutMs: 50 });
    expect(miss).toMatchObject({ ok: false, detail: 'timeout: missing' });
  });
});
