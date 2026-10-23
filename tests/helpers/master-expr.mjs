// Runs the expressions of a master spec (tools/masters/spec.mjs) in Node, for tests: a stand-in for
// thisComp with the CTRL values, the RIG sliders (keyed ones with AE's zero-speed temporal ease, the others
// by their own expressions), text layers whose ink comes from the test (FHD units at the master's font
// size, scaled by k as the variants scale the fonts) and every layer's expressions read back by name.
import { easedProgress } from '../../tools/masters/dump-keys.mjs';

export function keyedValue(keys, t) {
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * (a.outType === 'LINEAR' && b.inType === 'LINEAR' ? u : easedProgress(u, a.outEase[0][1], b.inEase[0][1]));
    }
  }
  return last.v;
}

// AE's linear(t, tMin, tMax, value1, value2), clamped; createPath(points, inTangents, outTangents, closed) as the
// path it makes.
const LIB = 'function linear(t, a, b, c, d) { var u = b === a ? 1 : (t - a) / (b - a); u = Math.max(0, Math.min(1, u)); return c + (d - c) * u; }\n' +
  'function createPath(p, i, o, c) { return { vertices: p, inTangents: i, outTangents: o, closed: c }; }\n';

// The last line of an expression is its value; `value` is the property's own (pre-expression) value and
// valueAtTime(t) its keys at t (an expression on keyed sliders and selectors remaps their time).
function compile(src) {
  const lines = src.split('\n');
  const body = LIB + lines.slice(0, -1).join('\n') + '\nreturn (' + lines[lines.length - 1] + ');';
  return new Function('thisComp', 'time', 'value', 'valueAtTime', body);
}

// spec: a built spec (toJSON); ctrl: CTRL values by effect name (1-based, as AE); texts: the field layers'
// strings; ink(layer, text) -> { l, w, b } in FHD units (w 0 for no ink, b below the baseline).
export function exprComp(spec, { w = 1920, h = 1080, ctrl = {}, texts = {}, ink }) {
  const k = Math.min(w, h) / 1080;
  const id = (layer, path) => layer + '|' + JSON.stringify(path);
  const exprs = new Map(spec.expressions.map((e) => [id(e.layer, e.path), compile(e.src)]));
  const keyed = new Map(spec.keys.map((e) => [id(e.layer, e.path), e.keys]));
  const statics = new Map();
  for (const L of spec.layers) {
    for (const fx of L.effects || []) statics.set(id(L.name, ['effect', fx.name]), fx.value === undefined ? 0 : (typeof fx.value === 'boolean' ? Number(fx.value) : fx.value));
    if (L.type === 'text') statics.set(id(L.name, ['text']), L.text.value);
  }
  for (const [name, v] of Object.entries(ctrl)) statics.set(id('CTRL', ['effect', name]), v);
  for (const [name, v] of Object.entries(texts)) statics.set(id(name, ['text']), v);
  const comp = { width: w, height: h, duration: spec.comp.duration, frameDuration: 1 / spec.comp.fps };
  const effectValue = (layer, name, t) => {
    const path = spec.expressions.find((e) => e.layer === layer && e.path[0] === 'effect' && e.path[1] === name);
    if (path) return exprs.get(id(layer, path.path))(comp, t);
    const key = spec.keys.find((e) => e.layer === layer && e.path[0] === 'effect' && e.path[1] === name);
    if (key) return keyedValue(key.keys, t);
    if (!statics.has(id(layer, ['effect', name]))) throw new Error(`no effect ${layer} / ${name}`);
    return statics.get(id(layer, ['effect', name]));
  };
  const textOf = (layer, t) => (exprs.has(id(layer, ['text'])) ? exprs.get(id(layer, ['text']))(comp, t, statics.get(id(layer, ['text']))) : statics.get(id(layer, ['text'])));
  // How far the words of a text hang under it at time t: its rise when the selector holds every word (Start
  // to End over all of it), as AE's sourceRectAtTime includes the animator. A text measured from its own
  // expressions counts as at rest (AE breaks that loop too).
  const busy = new Set();
  const rects = new Map();
  const START_P = ['selector', 'Rise', 'ADBE Text Percent Start'];
  const END_P = ['selector', 'Rise', 'ADBE Text Percent End'];
  // a property's expression at t: `value` and valueAtTime from its keys when it has any
  const run = (layer, path, t, value) => {
    const keys = keyed.get(id(layer, path));
    return exprs.get(id(layer, path))(comp, t, keys ? keyedValue(keys, t) : value, keys ? (tt) => keyedValue(keys, tt) : undefined);
  };
  const hangOf = (layer, t) => {
    if (busy.has(layer) || !exprs.has(id(layer, START_P))) return 0;
    busy.add(layer);
    try {
      const s = run(layer, START_P, t, 0);
      const e = exprs.has(id(layer, END_P)) ? run(layer, END_P, t, 100) : 100;
      const rise = exprs.has(id(layer, ['animator', 'Rise', 'ADBE Text Position 3D'])) ? exprs.get(id(layer, ['animator', 'Rise', 'ADBE Text Position 3D']))(comp, t)[1] : 0;
      return Math.abs(e - s) >= 99.9 ? rise : 0;
    } finally {
      busy.delete(layer);
    }
  };
  let now = 0;
  comp.layer = (name) => {
    if (!spec.layers.some((L) => L.name === name)) throw new Error('no layer ' + name);
    return {
      effect: (e) => () => ({ get value() { return effectValue(name, e, now); }, valueAtTime: (t) => effectValue(name, e, t) }),
      // ink(layer, text) -> { l, w, b }: b, how far the ink reaches below the baseline (FHD px), is 0 when left out
      // texts and controls are fixed for this comp, so a rect is computed once per layer and time; a text
      // measured from its own selector gets its rest rect, which is not kept
      sourceRectAtTime: (t = now) => {
        const key = name + '|' + t;
        if (!busy.has(name) && rects.has(key)) return rects.get(key);
        const r = ink(name, String(textOf(name, t) || ''));
        const hang = busy.has(name) ? 0 : hangOf(name, t);
        const rect = r.w > 0 ? { left: r.l * k, top: -36 * k, width: r.w * k, height: (36 + (r.b || 0)) * k + hang } : { left: 0, top: 0, width: 0, height: 0 };
        if (!busy.has(name)) rects.set(key, rect);
        return rect;
      },
      text: { get sourceText() { return textOf(name, now); } },
    };
  };
  return {
    k,
    // the value of a layer property at time t (its expression, else its keys)
    at(layer, path, t) {
      now = t;
      if (exprs.has(id(layer, path))) return run(layer, path, t, statics.get(id(layer, path)));
      if (keyed.has(id(layer, path))) return keyedValue(keyed.get(id(layer, path)), t);
      throw new Error(`no expression or keys on ${layer} ${path.join('/')}`);
    },
  };
}
