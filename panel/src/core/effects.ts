// Effects in After Effects (spec 6 «applyPreset», 6.1 step 7, 7 «Эффекты»): a brand .ffx applied to the
// layers the user selected, its first keys at the current time. S4 (AE 26.5) fixed the rules: applyPreset
// acts on every selected layer of the comp, and with nothing selected it makes a new solid — so the panel
// refuses without a selection. The preset leaves no reference to its file in the project: nothing is copied.
// «Фирменные кривые» (applyBrandEase) wait for the curve numbers of D19 (JSX dumps of phase 1).
import type { HostCaller } from './host';
import { error, messages, warning, type Problem } from './problems';
import { libraryFile, libraryKey } from './paths';
import type { HostContext, Item, Variant } from './types';

export const presetVariant = (item: Item): Variant | null => item.variants.find((v) => /\.ffx$/i.test(v.file ?? '')) ?? null;

export function isPreset(item: Item): boolean {
  return presetVariant(item) !== null;
}

export interface PresetRequest {
  id: string;
  version: number;
  title: string;
  libraryKey: string;
  targetId: string;
  file: string;
  timeSec: number;
  // Layers selected when the plan was made; the adapter applies to what is selected at the call.
  selection: number;
  undoLabel: string;
}

export interface PresetPlan {
  ok: boolean;
  problems: Problem[];
  request: PresetRequest | null;
}

export function planPreset(item: Item, ctx: HostContext, libraryRoot: string): PresetPlan {
  const problems: Problem[] = [];
  const v = presetVariant(item);
  if (ctx.host !== 'ae' || !v || !item.hosts.includes('ae')) {
    problems.push(error('NOT_SUPPORTED', messages.notSupported(ctx.host), { id: item.id }));
    return { ok: false, problems, request: null };
  }
  const t = ctx.target;
  if (!t) {
    problems.push(error('NO_TARGET', messages.noTarget('ae')));
    return { ok: false, problems, request: null };
  }
  if (!ctx.selection) problems.push(error('NO_SELECTION', messages.noSelection()));
  if (problems.length) return { ok: false, problems, request: null };
  return {
    ok: true,
    problems,
    request: {
      id: item.id,
      version: item.version,
      title: item.title_ru,
      libraryKey: libraryKey(item.id, item.version),
      targetId: t.id,
      file: libraryFile(libraryRoot, v.file as string),
      timeSec: t.timeSec,
      selection: ctx.selection ?? 0,
      undoLabel: `BrandKit: ${item.title_ru}`,
    },
  };
}

// What applyPreset of the AE adapter answers: per selected layer, whether the preset changed it (effects,
// text animators or keys), and layers that appeared (a preset may add one).
export interface PresetReply {
  layers: Array<{ name: string; layerId: number; changed: boolean; firstKeySec: number | null }>;
  newLayers: string[];
}

export interface PresetOutcome {
  ok: boolean;
  problems: Problem[];
  reply: PresetReply | null;
}

export async function runPreset(caller: HostCaller, request: PresetRequest, timeoutMs = 60000): Promise<PresetOutcome> {
  const r = await caller.call<PresetReply>('applyPreset', request, { mutating: true, timeoutMs });
  if (!r.ok || !r.data) {
    const code = r.error?.code ?? 'HOST_EXCEPTION';
    const msg = r.error?.message ?? 'нет ответа';
    if (code === 'NO_SELECTION') return { ok: false, problems: [error('NO_SELECTION', messages.noSelection())], reply: null };
    if (code === 'NO_TARGET') return { ok: false, problems: [error('NO_TARGET', messages.noTarget('ae'))], reply: null };
    if (code === 'TIMEOUT') return { ok: false, problems: [error('TIMEOUT', `${messages.timeout('ae', timeoutMs / 1000)} Проверьте слои и при необходимости отмените последнее действие.`)], reply: null };
    if (code === 'NO_FILE') return { ok: false, problems: [error('INSERT_FAILED', messages.insertFailed(msg))], reply: null };
    return { ok: false, problems: [error('HOST_ERROR', messages.hostError('ae', msg), r.error)], reply: null };
  }
  const d = r.data;
  const changed = d.layers.filter((l) => l.changed);
  const problems: Problem[] = [];
  if (!changed.length) {
    return { ok: false, problems: [error('PRESET_NO_EFFECT', messages.presetNoEffect(d.layers.map((l) => l.name)), d)], reply: d };
  }
  const missed = d.layers.filter((l) => !l.changed).map((l) => l.name);
  if (missed.length) problems.push(warning('PRESET_PARTIAL', messages.presetPartial(missed), d));
  if (d.newLayers.length) problems.push(warning('PRESET_NEW_LAYER', messages.presetNewLayer(d.newLayers), d));
  return { ok: true, problems, reply: d };
}
