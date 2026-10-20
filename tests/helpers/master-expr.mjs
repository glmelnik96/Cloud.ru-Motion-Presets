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
    if (t >= a.t && t <= b.t) return a.v + (b.v - a.v) * easedProgress((t - a.t) / (b.t - a.t), a.outEase[0][1], b.inEase[0][1]);
  }
  return last.v;
}

// AE's linear(t, tMin, tMax, value1, value2), clamped.
const LIB = 'function linear(t, a, b, c, d) { var u = b === a ? 1 : (t - a) / (b - a); u = Math.max(0, Math.min(1, u)); return c + (d - c) * u; }\n';

// The last line of an expression is its value.
function compile(src) {
  const lines = src.split('\n');
  const body = LIB + lines.slice(0, -1).join('\n') + '\nreturn (' + lines[lines.length - 1] + ');';
  return new Function('thisComp', 'time', body);
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
  const textOf = (layer, t) => (exprs.has(id(layer, ['text'])) ? exprs.get(id(layer, ['text']))(comp, t) : statics.get(id(layer, ['text'])));
  let now = 0;
  comp.layer = (name) => {
    if (!spec.layers.some((L) => L.name === name)) throw new Error('no layer ' + name);
    return {
      effect: (e) => () => ({ get value() { return effectValue(name, e, now); }, valueAtTime: (t) => effectValue(name, e, t) }),
      // ink(layer, text) -> { l, w, b }: b, how far the ink reaches below the baseline (FHD px), is 0 when left out
      sourceRectAtTime: () => {
        const r = ink(name, String(textOf(name, now) || ''));
        return r.w > 0 ? { left: r.l * k, top: -36 * k, width: r.w * k, height: (36 + (r.b || 0)) * k } : { left: 0, top: 0, width: 0, height: 0 };
      },
      text: { get sourceText() { return textOf(name, now); } },
    };
  };
  return {
    k,
    // the value of a layer property at time t (its expression, else its keys)
    at(layer, path, t) {
      const fn = exprs.get(id(layer, path));
      now = t;
      if (fn) return fn(comp, t);
      if (keyed.has(id(layer, path))) return keyedValue(keyed.get(id(layer, path)), t);
      throw new Error(`no expression or keys on ${layer} ${path.join('/')}`);
    },
  };
}
