// «Цвета» in After Effects (spec 7, D23: the old brandcolors panel goes into this tab): a brand token onto
// the fill, the stroke or the text of the selected layers. The palette is the base palette of
// brand/tokens.json, built into the panel like its theme; the extended palette stays out without a decision
// (tokens: color.extended._note).
//   fill   — Fill of shape layers (every Fill in their contents) and the colour of solids;
//   stroke — Stroke of shape layers;
//   text   — the fill colour of text layers;
//   effect — the Fill effect on any layer that takes effects (added, or the one already there): how the old
//            brandcolors panel paints, kept by D23 (docs/research/colors/brandcolors.md).
// A property with keys gets a key at the current time; one driven by an expression is left alone and named.
import { color } from '../../../brand/tokens.json';
import type { HostCaller } from './host';
import { error, messages, warning, type Problem } from './problems';
import type { HostContext } from './types';

export type ColorTarget = 'fill' | 'stroke' | 'text' | 'effect';

export interface Swatch {
  key: string;
  hex: string;
  role: string;
}

export const TARGETS: Array<{ key: ColorTarget; label_ru: string }> = [
  { key: 'fill', label_ru: 'Заливка' },
  { key: 'stroke', label_ru: 'Обводка' },
  { key: 'text', label_ru: 'Текст' },
  { key: 'effect', label_ru: 'Эффект Fill' },
];

export function palette(): Swatch[] {
  const base = color.base as Record<string, { hex: string; role: string }>;
  return Object.entries(base).map(([key, c]) => ({ key, hex: c.hex.toUpperCase(), role: c.role }));
}

// "#26D07C" -> [0.149, 0.816, 0.486] as AE takes colours (0..1, 8 bits per channel exact).
export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error('bad colour ' + hex);
  return [1, 2, 3].map((i) => Math.round((parseInt(m[i], 16) / 255) * 1e6) / 1e6) as [number, number, number];
}

export interface ColorRequest {
  targetId: string;
  target: ColorTarget;
  token: string;
  hex: string;
  rgb: [number, number, number];
  undoLabel: string;
}

export function planColor(ctx: HostContext, token: string, target: ColorTarget): { ok: boolean; problems: Problem[]; request: ColorRequest | null } {
  const problems: Problem[] = [];
  const swatch = palette().find((s) => s.key === token);
  if (ctx.host !== 'ae') problems.push(error('NOT_SUPPORTED', messages.notSupported(ctx.host)));
  else if (!ctx.target) problems.push(error('NO_TARGET', messages.noTarget('ae')));
  else if (!ctx.selection) problems.push(error('NO_SELECTION', messages.noSelectionColor()));
  if (!swatch) problems.push(error('BAD_VALUE', `Нет цвета ${token} в палитре.`));
  if (problems.length || !swatch || !ctx.target) return { ok: false, problems, request: null };
  const label = TARGETS.find((t) => t.key === target)!.label_ru.toLowerCase();
  return {
    ok: true,
    problems,
    request: { targetId: ctx.target.id, target, token, hex: swatch.hex, rgb: hexToRgb01(swatch.hex), undoLabel: `BrandKit: ${label} ${swatch.hex}` },
  };
}

// What applyColor of the AE adapter answers, per selected layer: properties set, how many of them got a key,
// and the ones an expression drives (not touched).
export interface ColorReply {
  layers: Array<{ name: string; set: number; keyed: number; expressions: string[]; solid?: boolean; addedFill?: boolean }>;
}

export async function runColor(caller: HostCaller, request: ColorRequest, timeoutMs = 30000): Promise<{ ok: boolean; problems: Problem[]; reply: ColorReply | null }> {
  const r = await caller.call<ColorReply>('applyColor', request, { mutating: true, timeoutMs });
  if (!r.ok || !r.data) {
    const code = r.error?.code ?? 'HOST_EXCEPTION';
    if (code === 'NO_SELECTION') return { ok: false, problems: [error('NO_SELECTION', messages.noSelectionColor())], reply: null };
    if (code === 'NO_TARGET') return { ok: false, problems: [error('NO_TARGET', messages.noTarget('ae'))], reply: null };
    return { ok: false, problems: [error('HOST_ERROR', messages.hostError('ae', r.error?.message ?? 'нет ответа'), r.error)], reply: null };
  }
  const d = r.data;
  const problems: Problem[] = [];
  const done = d.layers.filter((l) => l.set > 0);
  const missed = d.layers.filter((l) => l.set === 0 && !l.expressions.length).map((l) => l.name);
  const driven = d.layers.flatMap((l) => l.expressions.map((p) => `${l.name}: ${p}`));
  if (!done.length) {
    return { ok: false, problems: [error('COLOR_NO_TARGET', messages.colorNothing(request.target), d), ...(driven.length ? [warning('COLOR_EXPRESSION', messages.colorExpression(driven))] : [])], reply: d };
  }
  if (missed.length) problems.push(warning('COLOR_PARTIAL', messages.colorPartial(missed, request.target), d));
  if (driven.length) problems.push(warning('COLOR_EXPRESSION', messages.colorExpression(driven), d));
  if (d.layers.some((l) => l.solid && l.set)) problems.push(warning('COLOR_SOLID', messages.colorSolid(), d));
  return { ok: true, problems, reply: d };
}
