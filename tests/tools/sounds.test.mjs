// The sounds of the packs (tools/packs/sounds.mjs): audio files found, format and EBU R128 loudness, usage by
// file name from the dumps. Loudness runs on the real ffmpeg when it is installed.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findAudio, parseEbur128, soundsInventory, soundsMarkdown, usageByName } from '../../tools/packs/sounds.mjs';

const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;

describe('sounds of the packs', () => {
  it('reads the summary of ebur128', () => {
    const err = `[Parsed_ebur128_0 @ x] t: 1 TARGET:-23 LUFS M: -20.1 S:-120.7 I: -20.0 LUFS\n[Parsed_ebur128_0 @ x] Summary:\n\n  Integrated loudness:\n    I:         -18.4 LUFS\n    Threshold: -28.6 LUFS\n\n  Loudness range:\n    LRA:         2.3 LU\n\n  True peak:\n    Peak:       -1.2 dBFS`;
    expect(parseEbur128(err)).toEqual({ lufs: -18.4, lra: 2.3, truePeak: -1.2 });
    expect(parseEbur128('nothing')).toEqual({ lufs: null, lra: null, truePeak: null });
  });

  it('finds audio under the packs, skipping macOS junk', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-snd-'));
    for (const f of ['podcast/(Footage)/sfx/whoosh.wav', 'podcast/__MACOSX/._whoosh.wav', 'smm/music.MP3', 'smm/clip.mov']) {
      mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      writeFileSync(path.join(root, f), 'x');
    }
    expect(findAudio(root).map((f) => path.relative(root, f.file).replace(/\\/g, '/'))).toEqual(['podcast/(Footage)/sfx/whoosh.wav', 'smm/music.MP3']);
  });

  it('joins usage by file name, case and NFD aside', () => {
    const dumps = [{ dir: '/d/podcast', project: { items: [{ name: 'Whoosh', source: { file: 'C:\\packs\\podcast\\SFX\\Whoosh.wav', hasAudio: true }, usedInCount: 3 }, { name: 'clip', source: { file: 'C:/x/clip.mov', hasAudio: false } }] } }];
    expect([...usageByName(dumps).entries()]).toEqual([['whoosh.wav', [{ pack: 'podcast', item: 'Whoosh', usedIn: 3 }]]]);
  });

  it.skipIf(!HAS_FFMPEG)('measures format and loudness with ffmpeg', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-snd-real-'));
    mkdirSync(path.join(root, 'sfx'), { recursive: true });
    const wav = path.join(root, 'sfx', 'tone.wav');
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=3:sample_rate=48000', '-af', 'volume=-6dB', '-ac', '2', '-c:a', 'pcm_s24le', wav]);
    const files = soundsInventory({ packs: root, dumps: [] });
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ pack: 'sfx', codec: 'pcm_s24le', sampleRate: 48000, channels: 2, bits: 24, duration: 3 });
    // the sine of lavfi has amplitude 1/8 (-18 dBFS); -6 dB and -3 dB more from the mono-to-stereo pan:
    // true peak about -27 dBFS, and about -27 LUFS for a 1 kHz sine in both channels
    expect(files[0].truePeak).toBeGreaterThan(-28);
    expect(files[0].truePeak).toBeLessThan(-26);
    expect(files[0].lufs).toBeGreaterThan(-29);
    expect(files[0].lufs).toBeLessThan(-25);
    expect(soundsMarkdown(files)).toContain('| sfx | tone.wav | 3 | pcm_s24le 48 кГц 2 к. 24 бит |');
  }, 30000);
});
