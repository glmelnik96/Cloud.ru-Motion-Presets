// The core of «Экспорт» (panel/src/core/export.ts, decisions P18–P23): the presets a host can use, the ones
// offered for a frame, the file next to the project, the request and the replies of the adapters.
import { describe, expect, it } from 'vitest';
import { aomFile, exportFolder, exportPresets, fitOf, outputFile, planExport, presetsForFrame, runExport, safeName, type ExportPreset } from '../../panel/src/core/export';
import type { CallOptions, HostCaller, HostReply } from '../../panel/src/core/host';
import { aeContext, exampleCatalog, prContext } from './fixtures';

const LIB = 'C:/ProgramData/CloudRuBrandKit/library';
const preset = (host: 'ae' | 'pr', id: string): ExportPreset => exportPresets(exampleCatalog(), host, LIB).find((p) => p.id === id)!;
const none = () => false;

describe('export presets', () => {
  it('lists the nine presets in both hosts, with the .epr for Premiere and the template for AE', () => {
    const pr = exportPresets(exampleCatalog(), 'pr', LIB);
    const ae = exportPresets(exampleCatalog(), 'ae', LIB);
    expect(pr.map((p) => p.id)).toEqual(['AME_4K', 'AME_FullHD', 'AME_SMM_4x3', 'AME_SMM_16x9', 'AME_SMM_1x1', 'AME_SMM_9x16', 'AME_WebinarFinal', 'AME_WebinarTimer', 'AME_WebinarIntro']);
    expect(ae.map((p) => p.id)).toEqual(pr.map((p) => p.id));
    expect(pr[1]).toMatchObject({ w: 1920, h: 1080, fps: 25, epr: `${LIB}/items/AME_FullHD/AME_FullHD_epr_v1.epr`, omTemplate: 'CR FullHD' });
    expect(aomFile(exampleCatalog(), LIB)).toBe(`${LIB}/items/AME_Templates/AME_Templates_aom_v1.aom`);
  });

  it('offers the same size first, then smaller, then larger, and leaves other proportions out (P22)', () => {
    const all = exportPresets(exampleCatalog(), 'pr', LIB);
    const fhd = presetsForFrame(all, { w: 1920, h: 1080 });
    expect(fhd.map((x) => [x.preset.id, x.fit])).toEqual([
      ['AME_FullHD', 'same'], ['AME_SMM_16x9', 'same'], ['AME_WebinarFinal', 'same'], ['AME_WebinarTimer', 'same'], ['AME_WebinarIntro', 'same'], ['AME_4K', 'up'],
    ]);
    expect(presetsForFrame(all, { w: 3840, h: 2160 })[0]).toMatchObject({ preset: { id: 'AME_4K' }, fit: 'same' });
    expect(presetsForFrame(all, { w: 3840, h: 2160 })[1].fit).toBe('down');
    expect(presetsForFrame(all, { w: 1080, h: 1920 }).map((x) => x.preset.id)).toEqual(['AME_SMM_9x16']);
    expect(presetsForFrame(all, { w: 1000, h: 700 })).toEqual([]);
    expect(fitOf({ w: 1440, h: 1080 }, { w: 1920, h: 1440 })).toBe('down');
  });
});

describe('export files', () => {
  it('goes to Export next to the project, or to Documents for an unsaved one (P23)', () => {
    expect(exportFolder(prContext(), 'C:/Users/u/Documents')).toBe('C:/CRBK/work/pr/Export');
    expect(exportFolder(prContext({ project: { saved: false, path: null } }), 'C:/Users/u/Documents')).toBe('C:/Users/u/Documents/Cloud.ru BrandKit/Export');
  });

  it('never writes over a file: _2, _3 after the first', () => {
    const taken = new Set(['C:/x/Export/Edit_FullHD.mp4', 'C:/x/Export/Edit_FullHD_2.mp4']);
    expect(outputFile('C:/x/Export', 'Edit', 'AME_FullHD', (p) => taken.has(p))).toBe('C:/x/Export/Edit_FullHD_3.mp4');
    expect(outputFile('C:/x/Export', 'Edit', 'AME_SMM_9x16', none)).toBe('C:/x/Export/Edit_SMM_9x16.mp4');
  });

  it('makes a name of any sequence name', () => {
    expect(safeName('Вебинар: итог / v2?')).toBe('Вебинар_ итог _ v2_');
    expect(safeName('  ...  ')).toBe('export');
    expect(safeName('a'.repeat(200))).toHaveLength(80);
  });
});

describe('export plan', () => {
  it('Premiere: the .epr into the AME queue by default', () => {
    const p = planExport({ ctx: prContext(), preset: preset('pr', 'AME_FullHD'), mode: 'queue', documents: 'D:', exists: none });
    expect(p.ok).toBe(true);
    expect(p.request).toMatchObject({ host: 'pr', mode: 'queue', targetId: 'seq-1', epr: `${LIB}/items/AME_FullHD/AME_FullHD_epr_v1.epr`, output: 'C:/CRBK/work/pr/Export/Edit_FullHD.mp4', resize: null, fps: null });
  });

  it('AE: the template, Resize for a smaller preset and the preset fps for another comp rate', () => {
    const ctx = aeContext({ target: { ...aeContext().target!, w: 3840, h: 2160, fps: 30 } });
    const p = planExport({ ctx, preset: preset('ae', 'AME_FullHD'), mode: 'render', documents: 'D:', exists: none });
    expect(p.ok).toBe(true);
    expect(p.fit).toBe('down');
    expect(p.request).toMatchObject({ omTemplate: 'CR FullHD', resize: { w: 1920, h: 1080 }, fps: 25, output: 'C:/CRBK/work/user/Export/Main_FullHD.mp4' });
    expect(p.problems.map((x) => x.code)).toEqual(['EXPORT_FPS']);
  });

  it('warns about upscaling and refuses another proportion', () => {
    const up = planExport({ ctx: prContext(), preset: preset('pr', 'AME_4K'), mode: 'queue', documents: 'D:', exists: none });
    expect(up.ok).toBe(true);
    expect(up.problems.map((x) => [x.code, x.severity])).toEqual([['EXPORT_UPSCALE', 'warning']]);
    const bad = planExport({ ctx: prContext(), preset: preset('pr', 'AME_SMM_9x16'), mode: 'queue', documents: 'D:', exists: none });
    expect(bad.ok).toBe(false);
    expect(bad.problems[0].message).toBe('Пресет 1080×1920 другой пропорции, чем кадр 1920×1080: картинка сожмётся или ляжет с полями.');
  });

  it('refuses a background render of an unsaved AE project, and a mode of the other host', () => {
    const ctx = aeContext({ project: { saved: false, path: null } });
    expect(planExport({ ctx, preset: preset('ae', 'AME_FullHD'), mode: 'background', documents: 'D:', exists: none }).problems.map((x) => x.code)).toEqual(['NOT_SAVED']);
    expect(planExport({ ctx, preset: preset('ae', 'AME_FullHD'), mode: 'render', documents: 'D:', exists: none }).request!.output).toBe('D:/Cloud.ru BrandKit/Export/Main_FullHD.mp4');
    expect(planExport({ ctx: aeContext(), preset: preset('ae', 'AME_FullHD'), mode: 'queue', documents: 'D:', exists: none }).ok).toBe(false);
    expect(planExport({ ctx: aeContext({ target: null }), preset: preset('ae', 'AME_FullHD'), mode: 'render', documents: 'D:', exists: none }).problems[0].code).toBe('NO_TARGET');
  });
});

class Caller implements HostCaller {
  calls: Array<{ fn: string; opts?: CallOptions }> = [];
  constructor(private readonly reply: HostReply) {}
  async call<T>(fn: string, _args?: unknown, opts?: CallOptions): Promise<HostReply<T>> {
    this.calls.push({ fn, opts });
    return this.reply as HostReply<T>;
  }
}

describe('export run', () => {
  const req = (host: 'ae' | 'pr', mode: 'queue' | 'direct' | 'render' | 'background') => planExport({ ctx: host === 'ae' ? aeContext() : prContext(), preset: preset(host, 'AME_FullHD'), mode, documents: 'D:', exists: none }).request!;

  it('a queue call is short, a render may last hours', async () => {
    const c = new Caller({ ok: true, data: { file: 'x.mp4', queued: true } });
    await runExport(c, req('pr', 'queue'), null);
    await runExport(c, req('pr', 'direct'), null);
    expect(c.calls.map((x) => [x.fn, x.opts!.timeoutMs! <= 120000])).toEqual([['exportSequence', true], ['exportSequence', false]]);
    expect(c.calls.every((x) => x.opts!.mutating)).toBe(true);
  });

  it('a missing AE template gives the instruction with the .aom', async () => {
    const out = await runExport(new Caller({ ok: false, error: { code: 'NO_TEMPLATE', message: 'CR FullHD' } }), req('ae', 'render'), 'C:/lib/items/AME_Templates/AME_Templates_aom_v1.aom');
    expect(out.ok).toBe(false);
    expect(out.problems[0]).toMatchObject({ code: 'EXPORT_NO_TEMPLATE' });
    expect(out.problems[0].message).toBe('В After Effects нет шаблона вывода «CR FullHD». Загрузите брендовые шаблоны один раз: Edit → Templates → Output Module → Load… и выберите файл C:/lib/items/AME_Templates/AME_Templates_aom_v1.aom. Затем повторите экспорт.');
  });

  it('names a busy render queue and a failed export', async () => {
    expect((await runExport(new Caller({ ok: false, error: { code: 'RENDERING', message: '' } }), req('ae', 'render'), null)).problems[0].code).toBe('EXPORT_BUSY');
    expect((await runExport(new Caller({ ok: false, error: { code: 'EXPORT_FAILED', message: 'файл не появился' } }), req('pr', 'direct'), null)).problems[0].message).toBe('Экспорт не выполнен: файл не появился.');
  });
});
