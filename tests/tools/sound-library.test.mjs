// The sound library (phase 2 «Звуки»): the rules of tools/sounds/process.mjs — loudness targets, the cut of silence,
// mono, the filters, the order — and the source the catalog build merges (tools/library/source.mjs); the published
// list library/sounds.src.json against its schema.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gainDb, GROUPS, libraryOrder, MUSIC_GROUPS, parseLoudness, renderFilters, rule, sameChannels, soundingRange, soundItem, sourceEntry } from '../../tools/sounds/process.mjs';
import { loadSource } from '../../tools/library/source.mjs';
import { validateLibrary } from '../../tools/library/validate.mjs';
import { MUSIC_GROUPS as PANEL_MUSIC, SOUND_GROUPS } from '../../panel/src/core/library.ts';

const REPO = path.resolve(import.meta.dirname, '../..');

describe('sound rules', () => {
  it('levels one-shots by their loudest moment, long beds and music by the whole', () => {
    expect(rule({ id: 'SFX_Whoosh1', group: 'whoosh', sec: 0.8 })).toEqual({ mode: 'momentary', target: -18, trim: true });
    expect(rule({ id: 'SFX_HeavyRain', group: 'nature', sec: 62 })).toEqual({ mode: 'integrated', target: -24, trim: true });
    // a long riser builds to its moment: still a one-shot
    expect(rule({ id: 'SFX_EpicBuild', group: 'riser', sec: 20 }).mode).toBe('momentary');
    expect(rule({ id: 'SFX_MusicPodcast', group: 'cloud', sec: 160 })).toEqual({ mode: 'integrated', target: -18, trim: false });
    expect(rule({ id: 'SFX_MusicSynergy', group: 'electronic', sec: 140 }).mode).toBe('integrated');
    // the podcast pack's tracks keep the timing of their 10 s comps
    expect(rule({ id: 'SFX_PodcastQr1', group: 'brand', sec: 9.64 }).trim).toBe(false);
    expect(rule({ id: 'SFX_AirWhoosh', group: 'brand', sec: 1.3 }).trim).toBe(true);
  });

  it('reads ffmpeg\'s ebur128 and holds the true peak at -1 dBTP', () => {
    const log = [
      '[Parsed_ebur128_0 @ 0] t: 0.1  TARGET:-23 LUFS    M: -inf S:-120.7     I: -70.0 LUFS       LRA:   0.0 LU  FTPK: -inf dBFS',
      '[Parsed_ebur128_0 @ 0] t: 0.4  TARGET:-23 LUFS    M: -14.9 S:-120.7     I: -15.0 LUFS       LRA:   0.0 LU',
      '[Parsed_ebur128_0 @ 0] t: 0.5  TARGET:-23 LUFS    M: -16.2 S:-120.7     I: -15.2 LUFS       LRA:   0.0 LU',
      '[Parsed_ebur128_0 @ 0] Summary:', '  Integrated loudness:', '    I:         -18.2 LUFS', '  Loudness range:', '    LRA:         2.0 LU',
      '  True peak:', '    Peak:        -5.1 dBFS',
    ].join('\n');
    const l = parseLoudness(log);
    expect(l).toEqual({ maxM: -14.9, integrated: -18.2, truePeak: -5.1 });
    expect(gainDb({ mode: 'momentary', target: -18 }, l)).toBe(-3.1);
    // a click: its moment is quiet, its peak is not — the peak decides
    expect(gainDb({ mode: 'momentary', target: -18 }, { maxM: -26.8, integrated: -26.8, truePeak: -4.1 })).toBe(3.1);
    expect(gainDb({ mode: 'integrated', target: -24 }, { maxM: -10, integrated: -44.5, truePeak: -30 })).toBe(20.5);
    expect(() => gainDb({ mode: 'momentary', target: -18 }, { maxM: null, integrated: null, truePeak: null })).toThrow(/no measurable/);
  });

  it('finds the sounding part over the threshold, with 5 ms before and 50 ms after', () => {
    const rate = 1000;
    const x = new Float32Array(2 * 1000);
    for (let f = 300; f < 600; f++) x[f * 2 + 1] = 0.5;
    expect(soundingRange(x, 2, rate)).toEqual({ start: 0.295, end: 0.65, length: 1 });
    // a lower threshold keeps a quiet tail (a bed raised 20 dB)
    for (let f = 600; f < 800; f++) x[f * 2] = 0.0005;
    expect(soundingRange(x, 2, rate).end).toBe(0.65);
    expect(soundingRange(x, 2, rate, { db: -80 }).end).toBe(0.85);
    expect(soundingRange(new Float32Array(100), 1, rate)).toBeNull();
  });

  it('writes two equal channels as one', () => {
    expect(sameChannels(Float32Array.from([0.5, 0.5, -0.2, -0.2]))).toBe(true);
    expect(sameChannels(Float32Array.from([0.5, 0.4, -0.2, -0.2]))).toBe(false);
    expect(sameChannels(new Float32Array(4))).toBe(true);
  });

  it('cuts, mixes down, levels, fades and dithers to 16 bits at 48 kHz', () => {
    const f = renderFilters({ range: { start: 0.1, end: 2.4, length: 3 }, mono: true, gain: -3.1, trim: true });
    expect(f).toBe('aresample=48000,atrim=start=0.1:end=2.4,asetpts=PTS-STARTPTS,pan=mono|c0=0.5*c0+0.5*c1,volume=-3.1dB,afade=t=in:d=0.002,afade=t=out:st=2.28:d=0.02,aresample=osf=s16:dither_method=triangular');
    // music keeps its timing: no cut, no fades
    expect(renderFilters({ range: null, mono: false, gain: -7.2, trim: false })).toBe('aresample=48000,volume=-7.2dB,aresample=osf=s16:dither_method=triangular');
  });

  it('orders the library by group, then by title with numbers in order', () => {
    const e = [['SFX_Whoosh10', 'Вжух 10', 'whoosh'], ['SFX_MusicPodcast', 'Музыка подкаста', 'cloud'], ['SFX_Whoosh2', 'Вжух 2', 'whoosh'], ['SFX_Drops', 'Капли', 'nature']]
      .map(([id, title_ru, group]) => sourceEntry({ id, title_ru, group, keywords: id }, 1));
    // the sounds' groups first, then the music's
    expect(libraryOrder(e).map((x) => x.id)).toEqual(['SFX_Whoosh2', 'SFX_Whoosh10', 'SFX_Drops', 'SFX_MusicPodcast']);
    expect(sourceEntry({ id: 'SFX_MusicX', title_ru: 'X', group: 'calm', keywords: 'X', pack: 'music', src: 'audio:Music/x.wav' }, 120.12345)).toEqual({ id: 'SFX_MusicX', title_ru: 'X', group: 'calm', keywords: 'X', sec: 120.123, pack: 'music' });
    // the group says the category
    expect([soundItem(e[0]).category, soundItem(e[1]).category]).toEqual(['sounds', 'music']);
  });

  it('the panel lists the same groups in the same order', () => {
    expect(SOUND_GROUPS.map((g) => [g.key, g.label_ru])).toEqual(GROUPS);
    expect(PANEL_MUSIC.map((g) => [g.key, g.label_ru])).toEqual(MUSIC_GROUPS);
  });
});

describe('the source with its sounds', () => {
  it('merges sounds.src.json next to library.src.json as items of «Звуки»', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-src-'));
    const lib = JSON.parse(readFileSync(path.join(REPO, 'library', 'library.src.json'), 'utf8'));
    writeFileSync(path.join(dir, 'library.src.json'), JSON.stringify({ ...lib, items: lib.items.slice(0, 1) }));
    writeFileSync(path.join(dir, 'sounds.src.json'), JSON.stringify({ version: 1, sounds: [
      { id: 'SFX_Whoosh1', title_ru: 'Вжух 1', group: 'whoosh', keywords: 'Whoosh 1', sec: 0.643 },
      { id: 'SFX_MusicTest', title_ru: 'Тест', group: 'calm', keywords: 'Test', sec: 60, pack: 'music' },
    ] }));
    const doc = loadSource(path.join(dir, 'library.src.json'));
    expect(doc.items.map((i) => i.id)).toEqual([lib.items[0].id, 'SFX_Whoosh1', 'SFX_MusicTest']);
    expect(doc.items[1]).toEqual(soundItem({ id: 'SFX_Whoosh1', title_ru: 'Вжух 1', group: 'whoosh', keywords: 'Whoosh 1', sec: 0.643 }));
    expect([doc.items[2].category, doc.items[2].variants]).toEqual(['music', [{ key: 'wav', pack: 'music' }]]);
    expect(validateLibrary(doc).errors).toEqual([]);
  });

  it('the published list is valid, its ids unique and its titles distinct', () => {
    const doc = loadSource(path.join(REPO, 'library', 'library.src.json'));
    expect(validateLibrary(doc).errors).toEqual([]);
    const sounds = JSON.parse(readFileSync(path.join(REPO, 'library', 'sounds.src.json'), 'utf8')).sounds;
    expect(new Set(sounds.map((s) => s.id)).size).toBe(sounds.length);
    expect(new Set(sounds.map((s) => s.title_ru)).size).toBe(sounds.length);
    expect(sounds.every((s) => [...GROUPS, ...MUSIC_GROUPS].some(([g]) => g === s.group) && s.sec > 0)).toBe(true);
    // the templates lean on the pack's music: it comes with every install
    for (const id of ['SFX_MusicWebinar5min', 'SFX_MusicWebinar30s', 'SFX_MusicCourseIntro']) {
      expect(sounds.find((s) => s.id === id)).toMatchObject({ group: 'cloud' });
      expect(sounds.find((s) => s.id === id).pack).toBeUndefined();
    }
    // nothing of where a sound came from: no pack prefixes, no paths
    expect(sounds.some((s) => /^(KF|DA|SCH|VGT|AMZA) - |[\\/]/.test(s.keywords))).toBe(false);
    expect(libraryOrder(sounds).map((s) => s.id)).toEqual(sounds.map((s) => s.id));
  });
});
