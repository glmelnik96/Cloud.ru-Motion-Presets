// scaleImage (tools/qa/register.mjs): a golden resized by area averaging on premultiplied RGBA.
import { describe, expect, it } from 'vitest';
import { scaleImage } from '../../tools/qa/register.mjs';

const img = (w, h, px) => ({ width: w, height: h, data: Buffer.from(px.flat()) });
const pixels = (im) => Array.from({ length: im.width * im.height }, (_, i) => Array.from(im.data.subarray(i * 4, i * 4 + 4)));

describe('scaleImage', () => {
  it('halves by averaging pairs', () => {
    const r = scaleImage(img(4, 1, [[0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255]]), 2, 1);
    expect(pixels(r)).toEqual([[128, 128, 128, 255], [128, 128, 128, 255]]);
  });

  it('takes a fractional share of the pixels an output pixel covers (3 -> 2: weights 1 and 1/2)', () => {
    const r = scaleImage(img(3, 1, [[0, 0, 0, 255], [90, 90, 90, 255], [180, 180, 180, 255]]), 2, 1);
    expect(pixels(r)).toEqual([[30, 30, 30, 255], [150, 150, 150, 255]]);
  });

  it('a transparent pixel lends no colour, only its alpha', () => {
    const r = scaleImage(img(2, 1, [[255, 0, 0, 255], [0, 255, 0, 0]]), 1, 1);
    expect(pixels(r)).toEqual([[255, 0, 0, 128]]);
  });

  it('scales both axes: flat fields stay flat, a pixel across an edge mixes the colours by the area it covers', () => {
    const W = 6;
    const H = 2;
    const px = Array.from({ length: W * H }, (_, i) => (i % W < 2 ? [34, 34, 34, 255] : [38, 208, 124, 255]));
    const out = pixels(scaleImage(img(W, H, px), 4, 1));
    expect(out[0]).toEqual([34, 34, 34, 255]);
    expect(out[3]).toEqual([38, 208, 124, 255]);
    // output 1 covers source columns 1.5–3: a third of the dark one, two thirds of the green
    expect(out[1]).toEqual([37, 150, 94, 255]);
  });
});
