// The brand export presets into the build dir (tools/library/export-pack.mjs, decisions P18, P21): the canon
// agrees with the research and the example source, a re-saved .epr is checked, the .aom must name every
// template.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPORT_CANON, eprProblems, readEpr, stageExport } from '../../tools/library/export-pack.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const readJson = (p) => JSON.parse(readFileSync(path.join(REPO, p), 'utf8'));

// A .epr as Media Encoder writes it, reduced to the parameters the canon reads.
function epr({ w, h, fps = 25, level, target, max, profile = 3, rate = 48000, kbps = 320, ch = 2 }) {
  const p = (id, v) => `<ExporterParam ObjectID="1" ClassID="x" Version="1"><ParamIdentifier>${id}</ParamIdentifier><ParamValue>${v}</ParamValue></ExporterParam>`;
  return `<?xml version="1.0"?><PremiereData Version="3"><ExportPreset>${[
    p('ADBEVideoWidth', w), p('ADBEVideoHeight', h), p('ADBEVideoFPS', Math.round(254016000000 / fps)), p('ADBEVideoMPEGProfile', profile),
    p('ADBEVideoMPEGProfileLevel', level), p('ADBEVideoTargetBitrate', target), p('ADBEVideoMaxBitrate', max),
    p('ADBEAudioRatePerSecond', rate), p('ADBEAudioBitrate', kbps), p('ADBEAudioNumChannels', ch),
  ].join('')}</ExportPreset></PremiereData>`;
}

describe('export canon', () => {
  it('repeats the inventory of the nine presets, with 25 fps (D2)', () => {
    const inv = readJson('docs/research/export/epr-inventory.json').presets;
    for (const c of EXPORT_CANON) {
      const p = inv.find((x) => x.file === c.archive);
      expect([c.id, p.video.width, p.video.height, p.video.level.code, p.video.targetBitrateMbps, p.video.maxBitrateMbps]).toEqual([c.id, c.w, c.h, c.level, c.target, c.max]);
    }
    expect(EXPORT_CANON).toHaveLength(inv.length);
  });

  it('is in the library of the panel as in the example source (after the live runs of 2026-10-06)', () => {
    const real = readJson('library/library.src.json').items.filter((i) => i.category === 'export');
    const example = readJson('docs/library/example.src.json').items.filter((i) => i.category === 'export');
    expect(real).toEqual(example);
  });

  it('matches the export items of the example source', () => {
    const items = readJson('docs/library/example.src.json').items.filter((i) => i.category === 'export' && i.variants[0].key === 'epr');
    expect(items.map((i) => [i.id, i.omTemplate, i.variants[0].w, i.variants[0].h, i.variants[0].fps])).toEqual(EXPORT_CANON.map((c) => [c.id, c.omTemplate, c.w, c.h, 25]));
  });

  it('reads a .epr and names what differs', () => {
    const c = EXPORT_CANON.find((x) => x.id === 'AME_SMM_9x16');
    expect(eprProblems(c, readEpr(epr({ w: 1080, h: 1920, level: 42, target: 5, max: 12 })))).toEqual([]);
    expect(eprProblems(c, readEpr(epr({ w: 1080, h: 1920, fps: 30, level: 42, target: 5, max: 12, kbps: 192 })))).toEqual([
      'AME_SMM_9x16: fps 30, нужно 25',
      'AME_SMM_9x16: звук, кбит/с 192, нужно 320',
    ]);
  });
});

describe('export staging', () => {
  const setup = (over = {}) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bk-export-'));
    const eprDir = path.join(root, 'epr');
    mkdirSync(eprDir);
    for (const c of EXPORT_CANON) writeFileSync(path.join(eprDir, `${c.id}.epr`), epr({ ...c, ...(over[c.id] ?? {}) }));
    const aom = path.join(root, 'CR_BrandKit.aom');
    writeFileSync(aom, Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(EXPORT_CANON.map((c) => c.omTemplate).join('\0'), 'latin1')]));
    return { root, eprDir, aom, buildDir: path.join(root, 'build') };
  };

  it('copies the presets and the .aom under the build names', () => {
    const s = setup();
    const r = stageExport(s);
    expect(r.problems).toEqual([]);
    expect(r.staged).toHaveLength(10);
    expect(existsSync(path.join(s.buildDir, 'AME_FullHD', 'AME_FullHD_epr_v1.epr'))).toBe(true);
    expect(existsSync(path.join(s.buildDir, 'AME_Templates', 'AME_Templates_aom_v1.aom'))).toBe(true);
  });

  it('stages nothing wrong: a preset left at 30 fps and an .aom without a template', () => {
    const s = setup({ AME_SMM_1x1: { fps: 30 } });
    writeFileSync(s.aom, 'CR FullHD');
    const r = stageExport(s);
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('AME_SMM_1x1: fps 30, нужно 25');
    expect(r.problems).toContain('AME_Templates: в .aom нет шаблона «CR 4K»');
    expect(r.staged).not.toContain('AME_SMM_1x1/AME_SMM_1x1_epr_v1.epr');
    expect(existsSync(path.join(s.buildDir, 'AME_Templates'))).toBe(false);
  });

  it('--check copies nothing', () => {
    const s = setup();
    expect(stageExport({ ...s, check: true })).toEqual({ ok: true, problems: [], staged: [] });
  });
});
