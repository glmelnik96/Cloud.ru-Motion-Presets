import { describe, it, expect } from 'vitest';
import { frameRate, summarize } from '../../tools/lib/media-probe.mjs';

describe('media-probe', () => {
  it('turns ffprobe rates into numbers', () => {
    expect(frameRate('25/1')).toBe(25);
    expect(frameRate('30000/1001')).toBe(29.97);
    expect(frameRate('0/0')).toBe(null);
    expect(frameRate(undefined)).toBe(null);
  });
  it('summarises a ProRes 4444 movie with alpha', () => {
    const s = summarize({
      streams: [{ codec_type: 'video', codec_name: 'prores', profile: '4444', width: 1920, height: 1080,
        avg_frame_rate: '25/1', pix_fmt: 'yuva444p12le', nb_frames: '125' }],
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '5.000000' },
    });
    expect(s.video).toEqual({ codec: 'prores', profile: '4444', level: null, width: 1920, height: 1080, fps: 25,
      pixFmt: 'yuva444p12le', frames: 125 });
    expect(s.duration).toBe(5);
    expect(s.audio).toBe(null);
  });
  it('summarises an audio-only file and ignores N/A counts', () => {
    const s = summarize({
      streams: [{ codec_type: 'audio', codec_name: 'pcm_s16le', sample_rate: '48000', channels: 2, nb_frames: 'N/A' }],
      format: { format_name: 'wav', duration: '5.000000' },
    });
    expect(s.video).toBe(null);
    expect(s.audio).toEqual({ codec: 'pcm_s16le', sampleRate: 48000, channels: 2 });
  });
});
