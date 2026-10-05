// Which preview the form shows (panel/src/core/previews.ts): the format in use and the values of the form.
import { describe, expect, it } from 'vitest';
import { previewFor } from '../../panel/src/core/previews';
import type { Item, PreviewEntry } from '../../panel/src/core/types';
import { item } from './fixtures';

const S = (file: string) => ({ file, sha256: 'a'.repeat(64), bytes: 1 });
const entry = (variant: string, when?: PreviewEntry['when']): PreviewEntry => {
  const stem = variant + Object.entries(when ?? {}).map(([k, v]) => `_${k}-${v}`).join('');
  return { variant, when, video: S(`preview_${stem}.mp4`), poster: S(`poster_${stem}.jpg`) };
};

function ttl(): Item {
  const it = item('TTL_LowerThird');
  it.preview = S('preview.mp4');
  it.poster = S('poster.jpg');
  it.previews = [1, 2, 3].flatMap((style) => ['16x9', '9x16', '1x1'].map((v) => entry(v, { style })));
  return it;
}

const video = (it: Item, key: string | null, values: Record<string, number | boolean>) => previewFor(it, key, values).video?.file;

describe('preview of the form', () => {
  it('follows the format and the style', () => {
    const it = ttl();
    expect(video(it, '16x9', { style: 1 })).toBe('preview_16x9_style-1.mp4');
    expect(video(it, '9x16', { style: 2 })).toBe('preview_9x16_style-2.mp4');
    expect(video(it, '1x1', { style: 3 })).toBe('preview_1x1_style-3.mp4');
    expect(previewFor(it, '9x16', { style: 2 }).poster?.file).toBe('poster_9x16_style-2.jpg');
  });

  it('takes the preview of the same proportion for a 4K twin', () => {
    expect(video(ttl(), '16x9_4K', { style: 2 })).toBe('preview_16x9_style-2.mp4');
  });

  it('prefers the most specific preview that fits, else a less specific one, else the card', () => {
    const it = ttl();
    it.previews = [entry('16x9'), entry('16x9', { style: 2 }), entry('16x9', { style: 2, side: 2 })];
    expect(video(it, '16x9', { style: 2, side: 2 })).toBe('preview_16x9_style-2_side-2.mp4');
    expect(video(it, '16x9', { style: 2, side: 1 })).toBe('preview_16x9_style-2.mp4');
    expect(video(it, '16x9', { style: 3 })).toBe('preview_16x9.mp4');
    expect(video(it, '9x16', { style: 3 })).toBe('preview.mp4');
  });

  it('is the card preview without previews per format or without a variant', () => {
    const it = item('TTL_LowerThird');
    it.preview = S('preview.mp4');
    expect(video(it, '9x16', { style: 2 })).toBe('preview.mp4');
    expect(video(ttl(), null, { style: 2 })).toBe('preview.mp4');
  });
});
