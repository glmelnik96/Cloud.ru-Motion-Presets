// «Фирменные кривые» in After Effects (spec 7; D19 «Канон движения», numbers signed 2026-10-06 and kept in
// brand/tokens.json, section motion): a brand curve onto the keys the user selected. A cubic-bezier of the canon
// with y1 = 0 and y2 = 1 is exactly a pair of AE keys with speed 0: the outgoing influence of the first key is
// x1, the incoming influence of the second is 1 − x2. Each pair of neighbouring selected keys of a property gets
// it; the timing stays as the user set it (the canon's frames are shown as a hint).
import tokens from '../../../brand/tokens.json';
import { error, messages, warning, type Problem } from './problems';
import type { HostCaller } from './host';
import type { HostContext } from './types';

export interface BrandCurve {
  key: string;
  group: string;
  label: string;
  frames: number | null;
  bezier: [number, number, number, number];
  // AE ease of the pair: influences in percent, speeds 0.
  outInfluence: number;
  inInfluence: number;
}

type Json = Record<string, unknown>;

const TYPE: Record<string, string> = {
  M1: 'Плашка по X (M1)', M2: 'Подъём текста (M2)', M3: 'Подъём строк (M3)', M4: 'Вскрытие маской (M4)', M5: 'Поп (M5)',
  M8: 'Пролёт рамки (M8)', M10: 'Дрейф (M10)',
};
const STYLE: Record<string, string> = {
  titles: 'титры', podcast: 'подкаст', smm: 'SMM', logo: 'логошоты', titlesName: 'титры, имя', titlesRole: 'титры, должность',
  smmPlates: 'SMM, плашки', smmIntro: 'SMM, интро', courses: 'курсы',
};
const ROLE: Record<string, string> = {
  in: 'вход', out: 'выход', resize: 'смена размера', second: 'вторая плашка', position: 'позиция', mask: 'маска', dots: 'точки',
  stroke: 'обводка', segment: 'отрезок',
};

const r3 = (v: number) => Math.round(v * 1000) / 1000;

// The ease of a canon bezier, or null when it is not a pair of keys with speed 0 (an overshoot, a linear one).
export function easeOf(b: number[]): { outInfluence: number; inInfluence: number } | null {
  if (!Array.isArray(b) || b.length !== 4 || b[1] !== 0 || b[3] !== 1) return null;
  if (!(b[0] > 0 && b[0] <= 1) || !(b[2] >= 0 && b[2] < 1)) return null;
  return { outInfluence: r3(b[0] * 100), inInfluence: r3((1 - b[2]) * 100) };
}

const firstFrames = (f: unknown): number | null => (typeof f === 'number' ? f : Array.isArray(f) && typeof f[0] === 'number' ? f[0] : null);

// The curves of the canon the panel can put on keys, in the order of the types M1…M12.
export function brandCurves(motion: Json = (tokens as Json).motion as Json): BrandCurve[] {
  const out: BrandCurve[] = [];
  const add = (key: string, group: string, label: string, v: Json) => {
    const b = v.bezier as number[] | undefined;
    const e = b ? easeOf(b) : null;
    if (!b || !e) return;
    out.push({ key, group, label, frames: firstFrames(v.frames), bezier: b as BrandCurve['bezier'], ...e });
  };
  for (const [type, def] of Object.entries(motion ?? {})) {
    if (!/^M\d+$/.test(type) || !def || typeof def !== 'object') continue;
    const d = def as Json;
    const group = TYPE[type] ?? type;
    if (d.styles) {
      for (const [style, sv] of Object.entries(d.styles as Json)) {
        for (const [role, rv] of Object.entries(sv as Json)) {
          if (rv && typeof rv === 'object' && !Array.isArray(rv)) add(`${type}.${style}.${role}`, `${group}: ${STYLE[style] ?? style}`, ROLE[role] ?? role, rv as Json);
        }
      }
      continue;
    }
    for (const [role, rv] of Object.entries(d)) {
      if (rv && typeof rv === 'object' && !Array.isArray(rv)) add(`${type}.${role}`, group, ROLE[role] ?? role, rv as Json);
    }
  }
  return out;
}

export interface EaseRequest {
  targetId: string;
  curve: string;
  outInfluence: number;
  inInfluence: number;
  undoLabel: string;
}

export function planEase(ctx: HostContext, curve: BrandCurve | undefined): { problems: Problem[]; request: EaseRequest | null } {
  if (ctx.host !== 'ae') return { problems: [error('NOT_SUPPORTED', messages.notSupported(ctx.host))], request: null };
  if (!ctx.target) return { problems: [error('NO_TARGET', messages.noTarget('ae'))], request: null };
  if (!curve) return { problems: [error('NOT_SUPPORTED', messages.easeUnknown())], request: null };
  return {
    problems: [],
    request: { targetId: ctx.target.id, curve: curve.key, outInfluence: curve.outInfluence, inInfluence: curve.inInfluence, undoLabel: `BrandKit: кривая ${curve.group}, ${curve.label}` },
  };
}

// What applyEase answers: per property with keys selected, how many pairs got the curve; properties with one
// selected key are named apart.
export interface EaseReply {
  props: Array<{ name: string; layer: string; pairs: number }>;
  single: string[];
}

export async function runEase(caller: HostCaller, req: EaseRequest): Promise<{ ok: boolean; problems: Problem[]; reply: EaseReply | null }> {
  const r = await caller.call<EaseReply>('applyEase', req, { mutating: true, timeoutMs: 30000 });
  if (!r.ok || !r.data) {
    if (r.error?.code === 'NO_TARGET') return { ok: false, problems: [error('NO_TARGET', messages.noTarget('ae'))], reply: null };
    return { ok: false, problems: [error('HOST_ERROR', messages.hostError('ae', r.error?.message ?? 'нет ответа'), r.error)], reply: null };
  }
  const d = r.data;
  if (!d.props.length) return { ok: false, problems: [error('EASE_NO_KEYS', messages.easeNoKeys(d.single))], reply: d };
  const problems: Problem[] = [];
  if (d.single.length) problems.push(warning('EASE_SINGLE', messages.easeSingle(d.single)));
  return { ok: true, problems, reply: d };
}
