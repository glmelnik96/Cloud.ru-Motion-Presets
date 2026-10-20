// «Движения» in After Effects (spec 7 «Эффекты» — «Применить к выделенным»; plan 4, way Б decided 2026-10-20:
// rigs instead of .ffx files): the brand movements M1–M12 of D19 (brand/tokens.json, section motion) built on the
// layers the user selected, the first keys at the current time. The core turns the canon into operations with
// times in seconds and the eases of AE; the adapter (panel/host/ae-rigs.jsx) only writes them. Values are relative
// to the layer as it is: an entrance ends in the layer's current state, an exit starts from it.
import tokens from '../../../brand/tokens.json';
import { error, messages, warning, type Problem } from './problems';
import type { HostCaller } from './host';
import type { HostContext } from './types';

// The canon counts frames at 25 fps; a rig keeps those seconds in a comp of any rate.
const FPS = 25;

// KeyframeEase: speed in value units per second, influence in percent.
export type Ease = [number, number];
// A key: t in seconds from the start of the movement, v in the units of its operation; in and out eases as AE
// takes them; linear keys have no ease.
export interface RigKey {
  t: number;
  v: number | number[];
  in?: Ease;
  out?: Ease;
  linear?: boolean;
}

// 'abs' the value as is; 'add' the current value plus it; 'mul' the current value times it (and the speeds too).
export type Mode = 'abs' | 'add' | 'mul';

// Keys on a transform property, or on the stroke widths of a shape layer. dims: the dimensions keyed, the others
// keep their value; keySets: one set of keys per layer, in turn (the drift of M10 differs between neighbours).
export interface TrackOp {
  kind: 'track';
  prop: 'scale' | 'position' | 'opacity' | 'rotationX' | 'strokeWidth';
  mode: Mode;
  dims?: number[];
  keys: RigKey[];
  keySets?: RigKey[][];
  expression?: string;
}

// A text animator named `name` (an exit finds the one of the entrance): Position offset in heights of the text
// block, static (rise) or keyed; a range selector based on characters (1), words (3) or lines (4) with keys on its
// Start in percent.
export interface TextRiseOp {
  kind: 'textRise';
  name: string;
  basedOn: 1 | 3 | 4;
  rise?: number;
  positionKeys?: RigKey[];
  startKeys?: RigKey[];
}

// A rectangle mask named `name` around the bounds of the layer: each key spans [a, b] of the bounds along the
// axis (0 the left or top edge, 1 the right or bottom one). An exit keys the mask of the entrance if there is one.
export interface MaskOp {
  kind: 'mask';
  name: string;
  axis: 'x' | 'y';
  keys: RigKey[];
}

// A white solid with Fractal Noise (Block) over the layer, as its Luma matte (M7, M9 of the packs); the
// expressions drive Random Seed and Evolution.
export interface NoiseMatteOp {
  kind: 'noiseMatte';
  name: string;
  scale: number;
  seed?: string;
  evolution?: string;
}

// An expression on every property of this match name in the contents of a shape layer (the Offset of a Repeater).
export interface ExpressionOp {
  kind: 'expression';
  match: string;
  expression: string;
}

export interface Make3DOp {
  kind: 'make3D';
}

export type RigOp = TrackOp | TextRiseOp | MaskOp | NoiseMatteOp | ExpressionOp | Make3DOp;

export type RigLayers = 'any' | 'text' | 'shape';

export interface BrandRig {
  key: string;
  group: string;
  label: string;
  // What the button builds and on what, for its tooltip.
  hint: string;
  layers: RigLayers;
  // The length of the movement in frames of the canon, for the hint.
  frames: number;
  // Seconds between consecutive selected layers (top first); delays: the offsets of the first ones.
  stagger: number;
  delays: number[];
  ops: (frame: { w: number; h: number }) => RigOp[];
}

type Json = Record<string, unknown>;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const sec = (frames: number) => r6(frames / FPS);
// KeyframeEase takes an influence of 0.1 to 100 %.
const influence = (x: number) => Math.min(100, Math.max(0.1, r3(x * 100)));

// Two keys with a curve of the canon (x1, 0, x2, 1): speed 0, the outgoing influence x1 on the first, the incoming
// 1 − x2 on the second.
export function pair(frames: number, bezier: number[], from: number | number[], to: number | number[], startFrames = 0): RigKey[] {
  const t0 = sec(startFrames);
  return [
    { t: t0, v: from, out: [0, influence(bezier[0])] },
    { t: r6(t0 + sec(frames)), v: to, in: [0, influence(1 - bezier[2])] },
  ];
}

function linear(frames: number, from: number, to: number): RigKey[] {
  return [{ t: 0, v: from, linear: true }, { t: sec(frames), v: to, linear: true }];
}

// Keys written out in the canon (t in seconds, in and out as [speed, influence]), values and speeds mapped.
function canonKeys(keys: Json[], value: (v: number) => number = (v) => v, speed: (s: number) => number = (s) => s): RigKey[] {
  return keys.map((k) => {
    const out: RigKey = { t: k.t as number, v: r6(value(k.v as number)) };
    const e = (x: unknown): Ease | undefined => (Array.isArray(x) ? [r6(speed(x[0] as number)), x[1] as number] : undefined);
    const i = e(k.in);
    const o = e(k.out);
    if (i) out.in = i;
    if (o) out.out = o;
    return out;
  });
}

const firstFrames = (f: unknown): number => (typeof f === 'number' ? f : Array.isArray(f) && typeof f[0] === 'number' ? f[0] : 0);
const lastT = (keys: RigKey[]) => keys.reduce((m, k) => Math.max(m, k.t), 0);

const TYPE: Record<string, string> = {
  M1: 'Плашка по X (M1)', M2: 'Подъём текста (M2)', M3: 'Подъём строк (M3)', M4: 'Вскрытие маской (M4)', M5: 'Поп (M5)',
  M6: 'Флип куба (M6)', M7: 'Блочное проявление (M7)', M8: 'Пролёт рамки по Z (M8)', M9: 'Мерцающая сетка (M9)', M10: 'Дрейф (M10)',
  M11: 'Бегущая штриховка (M11)', M12: 'Поп куба логотипа (M12)',
};
const STYLE: Record<string, string> = {
  titles: 'титры', podcast: 'подкаст', smm: 'SMM', logo: 'логошоты', titlesName: 'титры, имя', titlesRole: 'титры, должность',
  smmPlates: 'SMM, плашки', smmIntro: 'SMM, интро', courses: 'курсы',
};

const HINT: Record<string, string> = {
  M1: 'Scale X от опорной точки слоя: поставьте её на край плашки, от которого она растёт.',
  M2: 'Только текстовые слои: аниматор «BrandKit M2», слова или строки поднимаются на высоту блока.',
  M3: 'Только текстовые слои: аниматор и маска «BrandKit M3», строка выходит снизу из маски.',
  M4: 'Маска «BrandKit M4» по границам слоя; «выход» закрывает ту же маску.',
  M5: 'Масштаб от нуля к нынешнему.',
  M6: 'Rotation X к нынешнему повороту; слою включается 3D.',
  M7: 'Над слоем — матовый слой «BrandKit M7» с Fractal Noise (Block), блоки меняются каждые 8 кадров.',
  M8: 'По оси Z к нынешнему положению, обводка фигур утончается; слою включается 3D.',
  M9: 'Над слоем — матовый слой «BrandKit M9» с Fractal Noise, Evolution time*40.',
  M10: 'Петля 60 с с loopOut(); у соседних слоёв свой рисунок.',
  M11: 'Только слои-фигуры с повторителем (Repeater): Offset -100 + time*0.5.',
  M12: 'Масштаб, X и прозрачность от нынешних, как в логошоте.',
};

// The drift of the course overlays (Shape Layer 22, 18, 17 of «Оверлей 16 на 9»): four segments of 15 s back to
// the start, in steps of their amplitude of 80 px in FHD.
const DRIFT = [
  [[0, 0], [-80, 0], [-80, 20], [-80, -20], [0, 0]],
  [[0, 0], [20, -36], [80, -36], [80, -10], [0, 0]],
  [[0, 0], [0, 10], [80, 10], [80, -22], [0, 0]],
];

// Every movement of the canon the panel builds, in the order M1…M12.
export function brandRigs(motion: Json = (tokens as Json).motion as Json): BrandRig[] {
  const m = motion as Record<string, Json>;
  const out: BrandRig[] = [];
  const add = (r: Omit<BrandRig, 'stagger' | 'delays' | 'layers' | 'hint'> & Partial<Pick<BrandRig, 'stagger' | 'delays' | 'layers'>>) =>
    out.push({ layers: 'any', stagger: 0, delays: [], hint: HINT[r.key.split('.')[0]] ?? '', ...r });

  // M1: Scale X of a plate, 0 to its width, per style; the exit of the logo shots runs along Y.
  const m1 = (m.M1?.styles ?? {}) as Record<string, Json>;
  for (const style of ['titles', 'podcast', 'smm', 'logo']) {
    const s = m1[style];
    if (!s) continue;
    for (const role of ['in', 'out'] as const) {
      const r = s[role] as Json | undefined;
      if (!r) continue;
      const f = r.frames as number;
      const keys = role === 'in' ? pair(f, r.bezier as number[], 0, 1) : pair(f, r.bezier as number[], 1, 0);
      add({
        key: `M1.${style}.${role}`, group: `${TYPE.M1}: ${STYLE[style]}`, label: role === 'in' ? 'вход' : 'выход', frames: f,
        stagger: sec((s.stagger as number) ?? 0),
        ops: () => [{ kind: 'track', prop: 'scale', mode: 'mul', dims: [r.axis === 'y' ? 1 : 0], keys }],
      });
    }
  }

  // M2: a text animator, the words or lines rise by the height of their block (the pack: 45 for a 40 px name).
  const m2 = (m.M2?.styles ?? {}) as Record<string, Json>;
  for (const style of ['titlesName', 'titlesRole', 'podcast', 'smmPlates', 'smmIntro', 'courses']) {
    const s = m2[style];
    if (!s) continue;
    const basedOn = s.by === 'lines' ? 4 : 3;
    const inn = s.in as Json;
    const f = firstFrames(inn.frames);
    const inKeys = inn.keys ? canonKeys(inn.keys as Json[]) : inn.linear ? linear(f, 0, 100) : pair(f, inn.bezier as number[], 0, 100);
    const delays = Array.isArray(s.delays) ? (s.delays as number[]).map(sec) : [];
    add({
      key: `M2.${style}.in`, group: `${TYPE.M2}: ${STYLE[style]}`, label: 'вход', frames: f, layers: 'text', delays, stagger: sec((s.stagger as number) ?? 0),
      ops: () => [{ kind: 'textRise', name: 'BrandKit M2', basedOn, rise: 1.15, startKeys: inKeys }],
    });
    const o = s.out as Json | undefined;
    if (o) {
      const fo = firstFrames(o.frames);
      const outKeys = pair(fo, o.bezier as number[], 100, 0);
      add({
        key: `M2.${style}.out`, group: `${TYPE.M2}: ${STYLE[style]}`, label: 'выход', frames: fo, layers: 'text', stagger: sec((s.stagger as number) ?? 0),
        ops: () => [{ kind: 'textRise', name: 'BrandKit M2', basedOn, rise: 1.15, startKeys: outKeys }],
      });
    }
  }

  // M3: the line rises out of its mask, whose lower edge opens over the last frames of the rise.
  const m3 = m.M3;
  if (m3) {
    const p = m3.position as Json;
    const k = m3.mask as Json;
    const fp = p.frames as number;
    const fm = k.frames as number;
    add({
      key: 'M3.in', group: TYPE.M3, label: 'вход', frames: fp, layers: 'text',
      ops: () => [
        { kind: 'textRise', name: 'BrandKit M3', basedOn: 1, positionKeys: pair(fp, p.bezier as number[], 1.1, 0) },
        { kind: 'mask', name: 'BrandKit M3', axis: 'y', keys: pair(fm, k.bezier as number[], [0, 0.83], [0, 1], fp - fm) },
      ],
    });
  }

  // M4: a mask opens from the left or top edge (entrance) and closes after it (exit).
  const m4 = m.M4;
  if (m4) {
    const i = m4.in as Json;
    const o = m4.out as Json;
    for (const axis of ['x', 'y'] as const) {
      const where = axis === 'x' ? 'по горизонтали' : 'по вертикали';
      add({
        key: `M4.${axis}.in`, group: TYPE.M4, label: `${where}: вход`, frames: i.frames as number,
        ops: () => [{ kind: 'mask', name: 'BrandKit M4', axis, keys: pair(i.frames as number, i.bezier as number[], [0, 0], [0, 1]) }],
      });
      add({
        key: `M4.${axis}.out`, group: TYPE.M4, label: `${where}: выход`, frames: o.frames as number,
        ops: () => [{ kind: 'mask', name: 'BrandKit M4', axis, keys: pair(o.frames as number, o.bezier as number[], [0, 1], [1, 1]) }],
      });
    }
  }

  // M5: Scale from 0; the dots of the disclaimer go in a ladder (the canon gives 9–13 frames and 3–5 apart: the middle).
  const m5 = m.M5;
  if (m5) {
    const i = m5.in as Json;
    const d = m5.dots as Json;
    const fd = Math.round(((d.frames as number[])[0] + (d.frames as number[])[1]) / 2);
    const sd = Math.round(((d.stagger as number[])[0] + (d.stagger as number[])[1]) / 2);
    add({ key: 'M5.in', group: TYPE.M5, label: 'поп', frames: i.frames as number, ops: () => [{ kind: 'track', prop: 'scale', mode: 'mul', keys: pair(i.frames as number, i.bezier as number[], 0, 1) }] });
    add({ key: 'M5.dots', group: TYPE.M5, label: 'точки лесенкой', frames: fd, stagger: sec(sd), ops: () => [{ kind: 'track', prop: 'scale', mode: 'mul', keys: pair(fd, d.bezier as number[], 0, 1) }] });
  }

  // M6: Rotation X of «Умное облако», ending at the layer's own rotation.
  const m6 = m.M6;
  if (m6) {
    const keys = canonKeys(m6.keys as Json[]);
    add({ key: 'M6.in', group: TYPE.M6, label: 'вход', frames: Math.round(lastT(keys) * FPS), ops: () => [{ kind: 'make3D' }, { kind: 'track', prop: 'rotationX', mode: 'add', keys }] });
  }

  // M7: blocks of Fractal Noise as a Luma matte; Random Seed one up every 8 frames. smm / Pattern_strelki has Scale
  // 244 in its 6539 x 5598 comp, which stands at 92 % in the 1080 x 1920 frame of Заставка_9x16: blocks of 224 px on
  // a short side of 1080 — the noise scales with the short side of the comp.
  const m7 = m.M7;
  if (m7) {
    const step = m7.randomSeedStepFrames as number;
    add({ key: 'M7.in', group: TYPE.M7, label: 'блоки', frames: step, ops: (fr) => [{ kind: 'noiseMatte', name: 'BrandKit M7', scale: r3((244 * 0.92 * Math.min(fr.w, fr.h)) / 1080), seed: `Math.floor(time * ${FPS} / ${step})` }] });
  }

  // M8: the frame flies in along Z (podcast / Контент_1 / LIne Comp 1, a 3840 frame) and its stroke thins.
  const m8 = m.M8;
  if (m8) {
    const i = m8.in as Json;
    const o = m8.out as Json;
    const st = m8.stroke as Json;
    add({
      key: 'M8.in', group: TYPE.M8, label: 'вход', frames: i.frames as number,
      ops: (fr) => {
        const k = fr.w / 3840;
        return [
          { kind: 'make3D' },
          { kind: 'track', prop: 'position', mode: 'add', dims: [2], keys: pair(i.frames as number, i.bezier as number[], r3((i.fromZ as number) * k), 0) },
          { kind: 'track', prop: 'strokeWidth', mode: 'add', keys: pair(st.frames as number, st.bezier as number[], r3(-(st.delta as number) * k), 0) },
        ];
      },
    });
    add({
      key: 'M8.out', group: TYPE.M8, label: 'выход', frames: o.frames as number,
      ops: (fr) => [{ kind: 'make3D' }, { kind: 'track', prop: 'position', mode: 'add', dims: [2], keys: pair(o.frames as number, o.bezier as number[], 0, r3((o.toZ as number) * (fr.w / 3840))) }],
    });
  }

  // M9: the same matte, Evolution by the expression of PATTERN RACK (Scale 225 in its 3840 x 2160 comp, the frame of
  // the webinars).
  const m9 = m.M9;
  if (m9) add({ key: 'M9.in', group: TYPE.M9, label: 'сетка', frames: 0, ops: (fr) => [{ kind: 'noiseMatte', name: 'BrandKit M9', scale: r3((225 * Math.min(fr.w, fr.h)) / 2160), evolution: m9.expression as string }] });

  // M10: a loop of four segments of 15 s with loopOut(), its amplitude in FHD pixels; neighbours take the three
  // drawings of the courses in turn.
  const m10 = m.M10;
  if (m10) {
    const seg = m10.segment as Json;
    const f = seg.frames as number;
    const b = seg.bezier as number[];
    for (const amp of [20, 60, 120]) {
      add({
        key: `M10.a${amp}`, group: TYPE.M10, label: `${amp} px`, frames: f * 4,
        ops: (fr) => {
          const k = (amp / 80) * (fr.h / 1080);
          const keySets = DRIFT.map((d) => d.map((p, n) => {
            const key: RigKey = { t: sec(f * n), v: [r3(p[0] * k), r3(p[1] * k)] };
            if (n > 0) key.in = [0, influence(1 - b[2])];
            if (n < d.length - 1) key.out = [0, influence(b[0])];
            return key;
          }));
          return [{ kind: 'track', prop: 'position', mode: 'add', dims: [0, 1], keys: keySets[0], keySets, expression: (m10.loop as Json).expression as string }];
        },
      });
    }
  }

  // M11: the hatching runs: the Offset of every Repeater of the shape layer.
  const m11 = m.M11;
  if (m11) add({ key: 'M11.in', group: TYPE.M11, label: 'штриховка', frames: 0, layers: 'shape', ops: () => [{ kind: 'expression', match: 'ADBE Vector Repeater Offset', expression: m11.expression as string }] });

  // M12: the pop of the logo cube as in the pack: Scale in fractions of the layer's own, X in FHD pixels from its
  // own position, Opacity up to its own.
  const m12 = (m.M12?.plain ?? null) as Json | null;
  if (m12) {
    const scale = canonKeys(m12.scale as Json[], (v) => v / 100, (s) => s / 100);
    const opacity = canonKeys(m12.opacity as Json[], (v) => v / 100, (s) => s / 100);
    add({
      key: 'M12.in', group: TYPE.M12, label: 'вход', frames: Math.round(lastT(scale) * FPS),
      ops: (fr) => {
        const k = fr.w / 1920;
        return [
          { kind: 'track', prop: 'scale', mode: 'mul', keys: scale },
          { kind: 'track', prop: 'position', mode: 'add', dims: [0], keys: canonKeys(m12.x as Json[], (v) => v * k, (s) => s * k) },
          { kind: 'track', prop: 'opacity', mode: 'mul', keys: opacity },
        ];
      },
    });
  }
  return out;
}

export interface RigRequest {
  targetId: string;
  rig: string;
  layers: RigLayers;
  ops: RigOp[];
  stagger: number;
  delays: number[];
  undoLabel: string;
}

export function planRig(ctx: HostContext, rig: BrandRig | undefined): { problems: Problem[]; request: RigRequest | null } {
  if (ctx.host !== 'ae') return { problems: [error('NOT_SUPPORTED', messages.notSupported(ctx.host))], request: null };
  if (!ctx.target) return { problems: [error('NO_TARGET', messages.noTarget('ae'))], request: null };
  if (!rig) return { problems: [error('NOT_SUPPORTED', messages.rigUnknown())], request: null };
  return {
    problems: [],
    request: {
      targetId: ctx.target.id, rig: rig.key, layers: rig.layers, ops: rig.ops({ w: ctx.target.w, h: ctx.target.h }),
      stagger: rig.stagger, delays: rig.delays, undoLabel: `BrandKit: ${rig.group}, ${rig.label}`,
    },
  };
}

// Why a layer was left as it was: not a text layer, not a shape layer, no Repeater, no size, no masks.
export type RigSkip = 'text' | 'shape' | 'repeater' | 'bounds' | 'masks';

// What applyRig answers per selected layer, top first.
export interface RigLayerReply {
  name: string;
  done: boolean;
  skipped?: RigSkip;
  made3D?: boolean;
  matte?: string;
  keys: number;
}

export interface RigReply {
  layers: RigLayerReply[];
}

export async function runRig(caller: HostCaller, req: RigRequest): Promise<{ ok: boolean; problems: Problem[]; reply: RigReply | null }> {
  const r = await caller.call<RigReply>('applyRig', req, { mutating: true, timeoutMs: 60000 });
  if (!r.ok || !r.data) {
    const code = r.error?.code;
    if (code === 'NO_SELECTION') return { ok: false, problems: [error('NO_SELECTION', messages.rigSelection())], reply: null };
    if (code === 'NO_TARGET') return { ok: false, problems: [error('NO_TARGET', messages.noTarget('ae'))], reply: null };
    return { ok: false, problems: [error('HOST_ERROR', messages.hostError('ae', r.error?.message ?? 'нет ответа'), r.error)], reply: null };
  }
  const d = r.data;
  const done = d.layers.filter((l) => l.done);
  const skipped = d.layers.filter((l) => !l.done).map((l) => `${l.name} (${messages.rigWhy(l.skipped)})`);
  if (!done.length) return { ok: false, problems: [error('RIG_NOTHING', messages.rigNothing(skipped))], reply: d };
  const problems: Problem[] = [];
  if (skipped.length) problems.push(warning('RIG_SKIPPED', messages.rigSkipped(skipped)));
  const made3D = done.filter((l) => l.made3D).map((l) => l.name);
  if (made3D.length) problems.push(warning('RIG_3D', messages.rig3D(made3D)));
  return { ok: true, problems, reply: d };
}
