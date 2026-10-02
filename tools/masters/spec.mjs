// Helpers that write the declarative layer spec read by tools/masters/jsx/build-spec.jsx.
// Paths: ['transform', mn] | ['group', g, item, mn] | ['text'] | ['animator', a, mn] | ['selector', a, mn]
// | ['effect', name, effectMatchName, param].
export const P = {
  pos: ['transform', 'ADBE Position'],
  scale: ['transform', 'ADBE Scale'],
  opacity: ['transform', 'ADBE Opacity'],
  anchor: ['transform', 'ADBE Anchor Point'],
  text: ['text'],
  rectSize: (g) => ['group', g, 'Rect', 'ADBE Vector Rect Size'],
  rectPos: (g) => ['group', g, 'Rect', 'ADBE Vector Rect Position'],
  fill: (g) => ['group', g, 'Fill', 'ADBE Vector Fill Color'],
  rise: (a = 'Rise') => ['animator', a, 'ADBE Text Position 3D'],
  start: (a = 'Rise') => ['selector', a, 'ADBE Text Percent Start'],
  slider: (name) => ['effect', name, 'ADBE Slider Control', 1],
};

export const shape = (name, groups, extra = {}) => ({ name, type: 'shape', groups, ...extra });
export const rectGroup = (name, fill) => ({ name, rect: true, fill });
export const pathGroup = (name, fill, paths, position) => ({ name, fill, paths, position });
export const text = (name, t, animators = [{ name: 'Rise', basedOn: 3 }]) => ({ name, type: 'text', text: t, animators });
export const nul = (name, effects, extra = {}) => ({ name, type: 'null', effects, ...extra });

export class Spec {
  constructor(comp) {
    this.comp = comp;
    this.layers = [];
    this.keys = [];
    this.expressions = [];
    this.mattes = [];
    this.visible = [];
  }

  add(...layers) {
    this.layers.push(...layers);
    return this;
  }

  key(layer, path, keys) {
    this.keys.push({ layer, path, keys });
    return this;
  }

  expr(layer, path, src) {
    this.expressions.push({ layer, path, src });
    return this;
  }

  matte(layer, matte, type = 'ALPHA', { keepVisible = true } = {}) {
    this.mattes.push({ layer, matte, type });
    if (keepVisible && !this.visible.includes(matte)) this.visible.push(matte);
    return this;
  }

  // top-to-bottom order as AE shows it (layers are created bottom first)
  order() {
    return this.layers.map((l) => l.name).reverse();
  }

  toJSON() {
    return { comp: this.comp, layers: this.layers, keys: this.keys, expressions: this.expressions, mattes: this.mattes, visible: this.visible, order: this.order() };
  }
}
