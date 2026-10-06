// «Экспорт» (spec 6 «exportWithPreset», 7; decisions P18–P23): the active comp or sequence rendered with a brand
// preset into <project folder>/Export.
//   Premiere — the .epr of the preset: by default into the AME queue (the call returns at once), or straight
//              from Premiere (exportAsMediaDirect, Premiere busy until the file is written). The range is In to
//              Out; without marks Premiere takes the whole sequence.
//   AE       — the Render Queue with the Output Module template of the preset, loaded by hand from the brand
//              .aom (a script cannot set H.264 profile, level or bitrate: docs/research/export/ae-om.json); or in
//              the background through aerender, which renders the saved project. The range is the work area.
// The .epr sets the frame and fps in Premiere whatever the sequence (docs/research/export/pr-epr.json); AE gets
// Resize and «Use this frame rate» from the panel when the comp differs.
import type { HostCaller } from './host';
import { basename, dirname, joinPath, libraryFile, type Platform } from './paths';
import { error, messages, warning, type Problem } from './problems';
import type { Catalog, Host, HostContext, HostTarget } from './types';

export type ExportMode = 'queue' | 'direct' | 'render' | 'background';
// The preset frame against the frame of the comp or sequence: the same, smaller, larger.
export type ExportFit = 'same' | 'down' | 'up';

export interface ExportPreset {
  id: string;
  title: string;
  version: number;
  aspect: string;
  w: number;
  h: number;
  fps: number;
  // Premiere: the .epr in the library. AE: the Output Module template by name.
  epr: string | null;
  omTemplate: string | null;
}

export const EXPORT_FOLDER = 'Export';
export const UNSAVED_FOLDER = 'Cloud.ru BrandKit';

export const MODES: Record<Host, Array<{ key: ExportMode; label_ru: string }>> = {
  pr: [{ key: 'queue', label_ru: 'В очередь Media Encoder' }, { key: 'direct', label_ru: 'Сразу, без AME' }],
  ae: [{ key: 'render', label_ru: 'Render Queue' }, { key: 'background', label_ru: 'В фоне (aerender)' }],
};

export const defaultMode = (host: Host): ExportMode => MODES[host][0].key;

// Presets of the catalog the host can use: the «Экспорт» category, an .epr variant with its frame, and in AE
// the template name.
export function exportPresets(catalog: Catalog, host: Host, libraryRoot: string): ExportPreset[] {
  const out: ExportPreset[] = [];
  for (const it of catalog.items) {
    if (it.category !== 'export' || !it.hosts.includes(host)) continue;
    const v = it.variants.find((x) => x.key === 'epr');
    if (!v || !v.w || !v.h || !v.fps) continue;
    const epr = v.file && /\.epr$/i.test(v.file) ? libraryFile(libraryRoot, v.file) : null;
    if (host === 'pr' && !epr) continue;
    if (host === 'ae' && !it.omTemplate) continue;
    out.push({ id: it.id, title: it.title_ru, version: it.version, aspect: v.aspect ?? '', w: v.w, h: v.h, fps: v.fps, epr, omTemplate: it.omTemplate ?? null });
  }
  return out;
}

// The brand .aom with the AE templates (P21), for the instruction when a template is missing.
export function aomFile(catalog: Catalog, libraryRoot: string): string | null {
  for (const it of catalog.items) {
    if (it.category !== 'export') continue;
    const v = it.variants.find((x) => x.key === 'aom' && x.file);
    if (v) return libraryFile(libraryRoot, v.file as string);
  }
  return null;
}

// null: another proportion, which the preset would squeeze or letterbox (P22).
export function fitOf(preset: { w: number; h: number }, frame: { w: number; h: number }): ExportFit | null {
  if (Math.abs(preset.w / preset.h - frame.w / frame.h) > 0.01 * (frame.w / frame.h)) return null;
  if (preset.w === frame.w && preset.h === frame.h) return 'same';
  return preset.w < frame.w ? 'down' : 'up';
}

const FIT_ORDER: Record<ExportFit, number> = { same: 0, down: 1, up: 2 };

// The presets offered for a frame: the same size first, then smaller, then larger; another proportion is left out.
export function presetsForFrame(presets: ExportPreset[], frame: { w: number; h: number }): Array<{ preset: ExportPreset; fit: ExportFit }> {
  return presets
    .map((preset) => ({ preset, fit: fitOf(preset, frame) }))
    .filter((x): x is { preset: ExportPreset; fit: ExportFit } => x.fit !== null)
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => FIT_ORDER[a.fit] - FIT_ORDER[b.fit] || a.i - b.i)
    .map(({ preset, fit }) => ({ preset, fit }));
}

export const fitLabel = (fit: ExportFit): string => (fit === 'same' ? '' : fit === 'down' ? 'уменьшение' : 'увеличение');

// Where the file goes (P23): next to the project; an unsaved project writes to Documents.
export function exportFolder(ctx: HostContext, documents: string): string {
  return ctx.project.path ? joinPath(dirname(ctx.project.path), EXPORT_FOLDER) : joinPath(documents, UNSAVED_FOLDER, EXPORT_FOLDER);
}

// A sequence or comp name as a file name on Windows and macOS.
export function safeName(s: string): string {
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return (t || 'export').slice(0, 80);
}

// <name>_<preset>.mp4, then _2, _3…: a finished file is never written over (P23).
export function outputFile(folder: string, targetName: string, presetId: string, exists: (p: string) => boolean): string {
  const base = `${safeName(targetName)}_${presetId.replace(/^AME_/, '')}`;
  for (let n = 1; n < 1000; n += 1) {
    const p = joinPath(folder, `${base}${n === 1 ? '' : `_${n}`}.mp4`);
    if (!exists(p)) return p;
  }
  return joinPath(folder, `${base}_${Date.now()}.mp4`);
}

export interface ExportRequest {
  host: Host;
  mode: ExportMode;
  targetId: string;
  targetName: string;
  presetId: string;
  title: string;
  epr: string | null;
  omTemplate: string | null;
  output: string;
  // AE: the preset frame when the comp is another size of the same proportion.
  resize: { w: number; h: number } | null;
  // AE: «Use this frame rate» when the comp runs at another rate.
  fps: number | null;
}

export interface ExportPlan {
  ok: boolean;
  problems: Problem[];
  fit: ExportFit | null;
  request: ExportRequest | null;
}

export interface ExportInput {
  ctx: HostContext;
  preset: ExportPreset;
  mode: ExportMode;
  documents: string;
  exists(p: string): boolean;
  platform?: Platform;
}

const fpsEqual = (a: number, b: number) => Math.abs(a - b) < 0.01;

export function planExport(input: ExportInput): ExportPlan {
  const { ctx, preset, mode } = input;
  const problems: Problem[] = [];
  const t: HostTarget | null = ctx.target;
  if (!MODES[ctx.host].some((m) => m.key === mode)) problems.push(error('NOT_SUPPORTED', messages.notSupported(ctx.host)));
  if (!t) {
    problems.push(error('NO_TARGET', messages.noTarget(ctx.host)));
    return { ok: false, problems, fit: null, request: null };
  }
  if ((ctx.host === 'pr' && !preset.epr) || (ctx.host === 'ae' && !preset.omTemplate)) problems.push(error('NOT_SUPPORTED', messages.notSupported(ctx.host)));
  const fit = fitOf(preset, t);
  if (fit === null) problems.push(error('EXPORT_ASPECT', messages.exportAspect(t.w, t.h, preset.w, preset.h)));
  if (fit === 'up') problems.push(warning('EXPORT_UPSCALE', messages.exportUpscale(t.w, t.h, preset.w, preset.h)));
  if (!fpsEqual(t.fps, preset.fps)) problems.push(warning('EXPORT_FPS', messages.exportFps(ctx.host, t.fps, preset.fps)));
  if (mode === 'background' && !ctx.project.path) problems.push(error('NOT_SAVED', messages.exportNotSaved()));
  if (problems.some((p) => p.severity === 'error')) return { ok: false, problems, fit, request: null };
  const output = outputFile(exportFolder(ctx, input.documents), t.name, preset.id, input.exists);
  return {
    ok: true,
    problems,
    fit,
    request: {
      host: ctx.host,
      mode,
      targetId: t.id,
      targetName: t.name,
      presetId: preset.id,
      title: preset.title,
      epr: preset.epr,
      omTemplate: preset.omTemplate,
      output,
      resize: ctx.host === 'ae' && fit !== 'same' ? { w: preset.w, h: preset.h } : null,
      fps: ctx.host === 'ae' && !fpsEqual(t.fps, preset.fps) ? preset.fps : null,
    },
  };
}

// What the adapters answer (exportSequence in pr.jsx, exportComp in ae.jsx).
export interface ExportReply {
  file: string;
  bytes?: number;
  ms?: number;
  // Premiere: the job is in the AME queue, the file comes later.
  queued?: boolean;
  job?: string;
  // Premiere: the range exported, seconds.
  inSec?: number;
  outSec?: number;
  // AE in the background: what aerender needs; the project has just been saved.
  aerender?: { exe: string; project: string; rqIndex: number };
}

// Long renders: a call may last as long as the render itself. The queue answers at once.
export const EXPORT_TIMEOUT_MS = 6 * 3600 * 1000;

export async function runExport(caller: HostCaller, request: ExportRequest, aom: string | null): Promise<{ ok: boolean; problems: Problem[]; reply: ExportReply | null }> {
  const fn = request.host === 'pr' ? 'exportSequence' : 'exportComp';
  const quick = request.mode === 'queue' || request.mode === 'background';
  const r = await caller.call<ExportReply>(fn, request, { mutating: true, timeoutMs: quick ? 120000 : EXPORT_TIMEOUT_MS });
  if (r.ok && r.data) return { ok: true, problems: [], reply: r.data };
  const code = r.error?.code ?? 'HOST_EXCEPTION';
  const msg = r.error?.message ?? 'нет ответа';
  if (code === 'NO_TEMPLATE') return { ok: false, problems: [error('EXPORT_NO_TEMPLATE', messages.exportNoTemplate(request.omTemplate ?? '', aom), r.error)], reply: null };
  if (code === 'RENDERING') return { ok: false, problems: [error('EXPORT_BUSY', messages.exportBusy())], reply: null };
  if (code === 'NO_TARGET') return { ok: false, problems: [error('NO_TARGET', messages.noTarget(request.host))], reply: null };
  if (code === 'NOT_SAVED') return { ok: false, problems: [error('NOT_SAVED', messages.exportNotSaved())], reply: null };
  if (code === 'TIMEOUT') return { ok: false, problems: [error('TIMEOUT', messages.timeout(request.host, EXPORT_TIMEOUT_MS / 1000), r.error)], reply: null };
  if (code === 'EXPORT_FAILED') return { ok: false, problems: [error('EXPORT_FAILED', messages.exportFailed(msg), r.error)], reply: null };
  return { ok: false, problems: [error('HOST_ERROR', messages.hostError(request.host, msg), r.error)], reply: null };
}

// The line of the result.
export function exportNote(request: ExportRequest, reply: ExportReply): string {
  const name = basename(reply.file || request.output);
  if (reply.queued) return `В очереди Media Encoder: ${name}. Media Encoder закодирует файл сам.`;
  if (reply.aerender) return `Рендер в фоне: ${name}. Можно работать дальше.`;
  return `Готово: ${name}.`;
}
