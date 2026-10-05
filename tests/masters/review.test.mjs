import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderFile, sceneGraph } from '../../tools/masters/review.mjs';
import { workPath } from '../../tools/lib/work.mjs';
import { renders, scenes } from '../../masters/review/pack1.mjs';

describe('review scenes', () => {
  it('lays out panels: source in its frame, crop, panel size, overlay, labels from files', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-review-')).replace(/\\/g, '/');
    const scene = {
      name: 't', duration: 2, title: 'Заголовок', note: '50 % — строка 1\nстрока 2',
      panels: [
        { src: { golden: 'logo/x' }, frame: { w: 1920, h: 1080 }, crop: { x: 0, y: 400, w: 1920, h: 280 }, at: [0, 190], size: [1920, 280], label: 'Оригинал', labelAt: [60, 140] },
        { src: { render: 'ls_x', start: 1.5 }, frame: { w: 1920, h: 1080 }, at: [20, 600], size: [960, 540], border: true },
      ],
    };
    const { inputs, graph } = sceneGraph(scene, dir);
    expect(inputs).toEqual(['-ss', '0', '-t', '3', '-i', workPath('golden/logo/x/preview_half.mp4'),
      '-ss', '1.5', '-t', '3', '-i', renderFile('ls_x')]);
    expect(graph).toContain('[0:v]fps=25,setpts=PTS-STARTPTS,scale=1920:1080,crop=1920:280:0:400,scale=1920:280:flags=lanczos');
    expect(graph).toContain('[b0][p0]overlay=0:190');
    expect(graph).toContain('drawbox=x=18:y=598:w=964:h=544');
    expect(graph).toContain('expansion=none');
    expect(graph).not.toMatch(/fontfile=[A-Za-z]:/);          // no drive colon inside the filter graph
    expect(readFileSync(path.join(dir, 't_note.txt'), 'utf8')).toBe('50 % — строка 1\nстрока 2');
  });

  it('every pack1 scene points at a declared render or a golden', () => {
    const names = new Set(Object.values(renders).flat().map((r) => r.name));
    for (const s of scenes) {
      for (const p of s.panels) {
        if (p.src.render) expect(names.has(p.src.render), `${s.name}: ${p.src.render}`).toBe(true);
        else expect(p.src.golden).toMatch(/^[a-z_]+\/[a-z0-9_]+$/);
      }
    }
  });
});
