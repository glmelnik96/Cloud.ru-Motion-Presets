// A fake of the parts of the After Effects object model the «Движения» adapter (panel/host/ae-rigs.jsx) touches,
// evaluated INSIDE node:vm with the host bundle. Behaviour after the scripting guide and the build PC (AE 26.5):
// - keys by time; a new key is linear on both sides with an ease per dimension (one for a spatial property; Scale
//   and Position carry three values on 2D layers too); valueAtTime gives the static value, or the value of the key
//   at or before the time, which is all a movement reads (the value at its start);
// - addProperty and switching 3D on invalidate every property object taken from the layer before
//   ('Object is invalid'), so the adapter must look them up again;
// - sourceRectAtTime from the layer's rect; setTrackMatte records the matte; addSolid puts a layer on top.
var PropertyType = { PROPERTY: 6212, INDEXED_GROUP: 6213, NAMED_GROUP: 6214 };
var KeyframeInterpolationType = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
var MaskMode = { NONE: 6812, ADD: 6813, SUBTRACT: 6814 };
var TrackMatteType = { NO_TRACK_MATTE: 5012, ALPHA: 5013, ALPHA_INVERTED: 5014, LUMA: 5015, LUMA_INVERTED: 5016 };
var BridgeTalk = { appName: 'aftereffects' };
var $ = { os: 'Windows/64 10.0', sleep: function () {} };

var __ae = { calls: [], undo: [], suppress: 0, nextId: 1 };

function KeyframeEase(speed, influence) {
  if (!(influence >= 0.1 && influence <= 100)) throw new Error('After Effects error: influence out of range');
  this.speed = speed;
  this.influence = influence;
}
function Shape() { this.vertices = []; this.closed = false; }
function CompItem() {}

// ---- nodes: the data; wrappers: what the scripts get, valid until the layer changes its tree ----

function leaf(matchName, name, value, opts) {
  opts = opts || {};
  return { leaf: true, matchName: matchName, name: name, value: value, keys: [], expression: '', spatial: !!opts.spatial, easeDims: opts.easeDims || (value instanceof Array && !opts.spatial ? value.length : 1), separated: false };
}
// opts.hidden: the properties of the group that are there before they are added, hidden (text animator properties).
function group(matchName, name, children, opts) {
  opts = opts || {};
  return { leaf: false, matchName: matchName, name: name, children: children || [], indexed: !!opts.indexed, add: opts.add || null, hidden: opts.hidden || null };
}

function copyEase(list) { return list.map(function (e) { return { speed: e.speed, influence: e.influence }; }); }
function defaultEase(n) { var a = []; for (var i = 0; i < n; i++) a.push({ speed: 0, influence: 16.666667 }); return a; }

function wrap(node, layer) {
  var gen = layer._gen;
  var live = function () { if (gen !== layer._gen) throw new Error('After Effects error: Object is invalid'); };
  var w = { matchName: node.matchName, propertyType: node.leaf ? PropertyType.PROPERTY : (node.indexed ? PropertyType.INDEXED_GROUP : PropertyType.NAMED_GROUP), _node: node };
  Object.defineProperty(w, 'name', { get: function () { live(); return node.name; }, set: function (v) { live(); node.name = v; } });
  if (!node.leaf) {
    Object.defineProperty(w, 'numProperties', { get: function () { live(); return node.children.length; } });
    w.property = function (k) {
      live();
      var c = typeof k === 'number' ? node.children[k - 1] : node.children.filter(function (x) { return x.matchName === k || x.name === k; })[0];
      if (!c && typeof k === 'string' && node.hidden && node.hidden.indexOf(k) >= 0) {
        c = leaf(k, k, 0);
        c.isHidden = true;
      }
      return c ? wrap(c, layer) : null;
    };
    w.canAddProperty = function (m) { live(); return !!(node.add && node.add(m, true)) && !node.children.some(function (x) { return x.matchName === m; }); };
    w.addProperty = function (m) {
      live();
      var c = node.add ? node.add(m) : null;
      if (!c) throw new Error('After Effects error: can not add ' + m + ' to ' + node.matchName);
      node.children.push(c);
      layer._gen += 1;
      __ae.calls.push('add ' + m);
      return wrap(c, layer);
    };
    if (node.matchName === 'ADBE Mask Atom') {
      Object.defineProperty(w, 'maskMode', { get: function () { live(); return node.mode; }, set: function (v) { live(); node.mode = v; } });
    }
    return w;
  }
  var sorted = function () { node.keys.sort(function (a, b) { return a.t - b.t; }); };
  var key = function (k) { if (!node.keys[k - 1]) throw new Error('After Effects error: no key ' + k); return node.keys[k - 1]; };
  Object.defineProperty(w, 'value', { get: function () { live(); return node.value; } });
  var visible = function (what) { if (node.isHidden) throw new Error('After Effects error: Can not “' + what + '” with this property, because the property or a parent property is hidden.'); };
  Object.defineProperty(w, 'numKeys', { get: function () { live(); return node.keys.length; } });
  Object.defineProperty(w, 'expression', { get: function () { live(); return node.expression; }, set: function (v) { live(); node.expression = v; __ae.calls.push('expression ' + node.matchName); } });
  Object.defineProperty(w, 'dimensionsSeparated', { get: function () { live(); return node.separated; } });
  w.setValue = function (v) { live(); visible('set value'); if (node.keys.length) throw new Error('After Effects error: the property has keys'); node.value = v; };
  w.setValueAtTime = function (t, v) {
    live();
    visible('set value at time');
    var hit = node.keys.filter(function (k) { return Math.abs(k.t - t) < 1e-6; })[0];
    if (hit) hit.v = v;
    else node.keys.push({ t: t, v: v, inI: KeyframeInterpolationType.LINEAR, outI: KeyframeInterpolationType.LINEAR, inE: defaultEase(node.easeDims), outE: defaultEase(node.easeDims), tangents: null, auto: node.spatial });
    sorted();
  };
  w.valueAtTime = function (t) {
    live();
    if (!node.keys.length) return node.value;
    var before = node.keys.filter(function (k) { return k.t <= t + 1e-9; });
    return (before.length ? before[before.length - 1] : node.keys[0]).v;
  };
  w.nearestKeyIndex = function (t) {
    live();
    var best = 1;
    node.keys.forEach(function (k, i) { if (Math.abs(k.t - t) < Math.abs(node.keys[best - 1].t - t)) best = i + 1; });
    return best;
  };
  w.keyTime = function (k) { live(); return key(k).t; };
  w.keyValue = function (k) { live(); return key(k).v; };
  w.keyInTemporalEase = function (k) { live(); return copyEase(key(k).inE); };
  w.keyOutTemporalEase = function (k) { live(); return copyEase(key(k).outE); };
  w.keyInInterpolationType = function (k) { live(); return key(k).inI; };
  w.keyOutInterpolationType = function (k) { live(); return key(k).outI; };
  w.setInterpolationTypeAtKey = function (k, a, b) { live(); key(k).inI = a; key(k).outI = b === undefined ? a : b; };
  w.setTemporalEaseAtKey = function (k, a, b) {
    live();
    if (a.length !== node.easeDims || (b && b.length !== node.easeDims)) throw new Error('After Effects error: wrong number of ease dimensions');
    key(k).inE = copyEase(a);
    if (b) key(k).outE = copyEase(b);
  };
  var spatialOnly = function () { if (!node.spatial) throw new Error('After Effects error: not a spatial property'); };
  w.setSpatialAutoBezierAtKey = function (k, on) { live(); spatialOnly(); key(k).auto = on; };
  w.setSpatialContinuousAtKey = function (k, on) { live(); spatialOnly(); key(k).continuous = on; };
  w.setSpatialTangentsAtKey = function (k, a, b) { live(); spatialOnly(); key(k).tangents = [a, b]; };
  return w;
}

// ---- the property trees of a layer ----

function transformGroup(o) {
  var three = !!o.threeD;
  var pos = leaf('ADBE Position', 'Position', (o.position || [960, 540]).concat([0]), { spatial: true });
  var kids = [
    leaf('ADBE Anchor Point', 'Anchor Point', [0, 0, 0], { spatial: true }),
    pos,
    leaf('ADBE Position_0', 'X Position', pos.value[0]),
    leaf('ADBE Position_1', 'Y Position', pos.value[1]),
    leaf('ADBE Position_2', 'Z Position', pos.value[2]),
    leaf('ADBE Scale', 'Scale', (o.scale || [100, 100]).concat([100])),
  ];
  if (three) kids.push(leaf('ADBE Rotate X', 'X Rotation', o.rotationX || 0));
  kids.push(leaf('ADBE Rotate Z', 'Rotation', 0), leaf('ADBE Opacity', 'Opacity', o.opacity === undefined ? 100 : o.opacity));
  pos.separated = !!o.separated;
  return group('ADBE Transform Group', 'Transform', kids);
}

function fractalNoise() {
  var p = [];
  for (var i = 1; i <= 31; i++) {
    var m = 'ADBE Fractal Noise-' + ('000' + i).slice(-4);
    p.push(leaf(m, m === 'ADBE Fractal Noise-0023' ? 'Evolution' : m === 'ADBE Fractal Noise-0027' ? 'Random Seed' : 'p' + i, 0));
  }
  return group('ADBE Fractal Noise', 'Fractal Noise', p);
}

function selector() {
  var adv = group('ADBE Text Range Advanced', 'Advanced', [leaf('ADBE Text Range Units', 'Units', 1), leaf('ADBE Text Range Type2', 'Based On', 1)]);
  return group('ADBE Text Selector', 'Range Selector 1', [leaf('ADBE Text Percent Start', 'Start', 0), leaf('ADBE Text Percent End', 'End', 100), leaf('ADBE Text Percent Offset', 'Offset', 0), adv]);
}

function textAnimator() {
  var props = group('ADBE Text Animator Properties', 'Properties', [], {
    hidden: ['ADBE Text Position 3D', 'ADBE Text Opacity'],
    add: function (m, probe) { return m === 'ADBE Text Position 3D' ? (probe ? true : leaf(m, 'Position', [0, 0, 0])) : null; },
  });
  var sels = group('ADBE Text Selectors', 'Selectors', [], { indexed: true, add: function (m, probe) { return m === 'ADBE Text Selector' ? (probe ? true : selector()) : null; } });
  return group('ADBE Text Animator', 'Animator 1', [sels, props]);
}

function shapeContents(o) {
  var groups = (o.strokes || []).map(function (w, i) {
    var stroke = group('ADBE Vector Graphic - Stroke', 'Stroke 1', [leaf('ADBE Vector Stroke Width', 'Stroke Width', w)]);
    return group('ADBE Vector Group', 'Group ' + (i + 1), [group('ADBE Vectors Group', 'Contents', [stroke])]);
  });
  for (var r = 0; r < (o.repeaters || 0); r++) {
    groups.push(group('ADBE Vector Filter - Repeater', 'Repeater ' + (r + 1), [leaf('ADBE Vector Repeater Copies', 'Copies', 3), leaf('ADBE Vector Repeater Offset', 'Offset', 0)]));
  }
  return group('ADBE Root Vectors Group', 'Contents', groups);
}

// opts: name, type 'shape' | 'text' | 'solid' | 'audio', threeD, position, scale, opacity, separated, rect, strokes,
// repeaters, masks (false: the layer takes none).
function Layer(comp, o) {
  this._comp = comp;
  this._gen = 0;
  this.id = __ae.nextId++;
  this.name = o.name;
  this.selected = !!o.selected;
  this._type = o.type || 'solid';
  this._threeD = !!o.threeD;
  this._o = o;
  this._rect = o.rect === undefined ? { top: -50, left: -200, width: 400, height: 100 } : o.rect;
  this._matte = null;
  var kids = [];
  if (this._type !== 'audio') kids.push(transformGroup(o));
  if (this._type === 'text') {
    var anims = group('ADBE Text Animators', 'Animators', [], { indexed: true, add: function (m, probe) { return m === 'ADBE Text Animator' ? (probe ? true : textAnimator()) : null; } });
    kids.push(group('ADBE Text Properties', 'Text', [leaf('ADBE Text Document', 'Source Text', o.name), anims]));
  }
  if (this._type === 'shape') kids.push(shapeContents(o));
  if (o.masks !== false && this._type !== 'audio') {
    kids.push(group('ADBE Mask Parade', 'Masks', [], { indexed: true, add: function (m, probe) {
      if (m !== 'ADBE Mask Atom') return null;
      if (probe) return true;
      var g = group('ADBE Mask Atom', 'Mask 1', [leaf('ADBE Mask Shape', 'Mask Path', new Shape(), { easeDims: 1 }), leaf('ADBE Mask Opacity', 'Mask Opacity', 100)]);
      g.mode = MaskMode.ADD;
      return g;
    } }));
  }
  if (this._type !== 'audio') kids.push(group('ADBE Effect Parade', 'Effects', [], { indexed: true, add: function (m, probe) { return m === 'ADBE Fractal Noise' ? (probe ? true : fractalNoise()) : null; } }));
  this._root = group('root', o.name, kids);
}
Object.defineProperty(Layer.prototype, 'index', { get: function () { return this._comp._layers.indexOf(this) + 1; } });
Object.defineProperty(Layer.prototype, 'threeDLayer', {
  get: function () { return this._threeD; },
  set: function (on) {
    if (on && !this._threeD) {
      var tr = this._root.children[0];
      var rot = leaf('ADBE Rotate X', 'X Rotation', 0);
      tr.children.splice(6, 0, rot);
      tr.children[1].easeDims = 1;
      this._gen += 1;
      __ae.calls.push('3D ' + this.name);
    }
    this._threeD = !!on;
  },
});
Layer.prototype.property = function (m) {
  var c = this._root.children.filter(function (x) { return x.matchName === m; })[0];
  return c ? wrap(c, this) : null;
};
Layer.prototype.sourceRectAtTime = function () { if (!this._rect) throw new Error('After Effects error: no rect'); return this._rect; };
Layer.prototype.setTrackMatte = function (layer, type) { this._matte = { layer: layer, type: type }; layer._matteOff = true; __ae.calls.push('matte ' + this.name + ' <- ' + layer.name); };
Layer.prototype.moveBefore = function (other) {
  var list = this._comp._layers;
  list.splice(list.indexOf(this), 1);
  list.splice(list.indexOf(other), 0, this);
};

function makeComp(o) {
  var c = new CompItem();
  c.id = 7;
  c.name = 'Main';
  c.width = o.w || 1920;
  c.height = o.h || 1080;
  c.pixelAspect = 1;
  c.duration = 30;
  c.time = o.time || 0;
  c._layers = [];
  c.layer = function (i) { return c._layers[i - 1]; };
  Object.defineProperty(c, 'numLayers', { get: function () { return c._layers.length; } });
  // The selection in the order the user clicked, not the order of the layers (o.selectOrder: names).
  Object.defineProperty(c, 'selectedLayers', { get: function () {
    var sel = c._layers.filter(function (l) { return l.selected; });
    if (o.selectOrder) sel.sort(function (a, b) { return o.selectOrder.indexOf(a.name) - o.selectOrder.indexOf(b.name); });
    return sel;
  } });
  c.layers = { addSolid: function (color, name, w, h, pa, dur) {
    var l = new Layer(c, { name: name, type: 'solid', rect: { top: 0, left: 0, width: w, height: h } });
    l._solid = { color: color, w: w, h: h, pa: pa, dur: dur };
    c._layers.unshift(l);
    __ae.calls.push('solid ' + name);
    return l;
  } };
  return c;
}

var app = {
  project: { activeItem: null },
  beginUndoGroup: function (n) { __ae.undo.push('begin ' + n); },
  endUndoGroup: function () { __ae.undo.push('end'); },
  beginSuppressDialogs: function () { __ae.suppress += 1; },
  endSuppressDialogs: function () { __ae.suppress -= 1; },
};

// Test setup: a comp with layers (top first), the active item.
__ae.comp = function (o, layers) {
  var c = makeComp(o || {});
  (layers || []).forEach(function (lo) { c._layers.push(new Layer(c, lo)); });
  app.project.activeItem = c;
  return c;
};
// The node of a property for the test to read: layer name, then match names or display names down the tree.
__ae.node = function (layerName, path) {
  var l = app.project.activeItem._layers.filter(function (x) { return x.name === layerName; })[0];
  var n = l._root;
  for (var i = 0; i < path.length; i++) {
    n = n.children.filter(function (x) { return x.matchName === path[i] || x.name === path[i]; })[0];
    if (!n) return null;
  }
  return n;
};
__ae.layerNames = function () { return app.project.activeItem._layers.map(function (l) { return l.name; }); };
__ae.matteOf = function (name) {
  var l = app.project.activeItem._layers.filter(function (x) { return x.name === name; })[0];
  return l._matte ? { layer: l._matte.layer.name, type: l._matte.type, off: !!l._matte.layer._matteOff } : null;
};
