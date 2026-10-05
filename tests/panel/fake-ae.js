// A fake of the After Effects object model for panel/host/ae.jsx, evaluated INSIDE node:vm so that
// instanceof works across the JSX and the fake. Behaviour taken from spike S3 on AE 26.5:
// - importFile of an .aep as a project returns a FolderItem with the template comps;
// - a new layer starts at 0 and lasts the duration of its source; without time remap the out point is
//   clamped to the end of the source;
// - switching time remap on adds two keys (in -> 0, out -> duration) and invalidates property objects taken
//   before (the Essential Properties group is looked up again);
// - Essential Property values: text as a TextDocument, checkbox/dropdown/slider as numbers;
// - media footage (__ae.media): Interpret Footage > Loop multiplies the duration of the item, a still has
//   none and its layer lasts as long as it is told; a new layer goes on top, moveAfter puts it under another.
var PropertyType = { PROPERTY: 6212, INDEXED_GROUP: 6213, NAMED_GROUP: 6214 };
var PropertyValueType = { NO_VALUE: 6412, ThreeD_SPATIAL: 6413, OneD: 6417, COLOR: 6418 };
var KeyframeInterpolationType = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
var ImportAsType = { COMP_CROPPED_LAYERS: 3812, FOOTAGE: 3813, COMP: 3814, PROJECT: 3815 };
var BridgeTalk = { appName: 'aftereffects' };
var $ = { os: 'Windows/64 10.0', sleep: function () {} };

var __ae = { files: {}, folders: {}, aeps: {}, media: {}, presets: {}, calls: [], nextId: 100, undo: [], suppress: 0, imports: 0, fonts: {} };

function __norm(p) { return String(p).split('\\').join('/'); }

function Folder(p) {
  this._path = __norm(p).replace(/\/+$/, '');
  this.fsName = this._path;
  this.exists = __ae.folders[this._path] === true;
  var i = this._path.lastIndexOf('/');
  this.parent = i > 0 ? { fsName: this._path.slice(0, i), exists: __ae.folders[this._path.slice(0, i)] === true } : null;
}
Folder.prototype.create = function () {
  if (this.parent && !__ae.folders[this.parent.fsName]) return false;
  __ae.folders[this._path] = true;
  this.exists = true;
  return true;
};

function File(p) {
  this._path = __norm(p);
  this.fsName = this._path;
  this.name = this._path.slice(this._path.lastIndexOf('/') + 1);
  this.exists = __ae.files[this._path] !== undefined;
}
File.prototype.copy = function (dst) {
  var target = dst instanceof File ? dst._path : __norm(dst);
  var dir = target.slice(0, target.lastIndexOf('/'));
  if (!__ae.folders[dir]) return false;
  __ae.files[target] = __ae.files[this._path];
  __ae.calls.push('copy ' + this._path + ' -> ' + target);
  return true;
};

function TextDocument(text) { this.text = text; this.fillColor = [1, 1, 1]; this.applyFill = true; }
function SolidSource(color) { this.color = color; this.isStill = true; }

// A colour property of the fake: value, keys at times, an expression.
function __colorProp(name, matchName, value, opts) {
  opts = opts || {};
  var p = { name: name, matchName: matchName, propertyType: PropertyType.PROPERTY, _value: value, _keys: (opts.keys || []).map(function (t) { return { t: t, v: value }; }),
    expression: opts.expression || '', expressionEnabled: !!opts.expression };
  Object.defineProperty(p, 'numKeys', { get: function () { return p._keys.length; } });
  Object.defineProperty(p, 'value', { get: function () { return p._value; } });
  p.setValue = function (v) {
    if (p._keys.length) throw new Error('setValue on an animated property');
    // AE: a shape colour takes exactly [r, g, b, a]
    if (/Vector (Fill|Stroke) Color/.test(matchName) && (!v || v.length !== 4)) throw new Error('After Effects error: Array is wrong length');
    p._value = v;
    __ae.calls.push('set ' + matchName);
  };
  p.setValueAtTime = function (t, v) {
    var hit = p._keys.filter(function (k) { return Math.abs(k.t - t) < 1e-6; })[0];
    if (hit) hit.v = v; else p._keys.push({ t: t, v: v });
    __ae.calls.push('key ' + matchName + ' @' + t);
  };
  // the value of the last key at or before t (hold), else the static value
  p.valueAtTime = function (t) {
    var ks = p._keys.slice().sort(function (a, b) { return a.t - b.t; }).filter(function (k) { return k.t <= t + 1e-6; });
    return ks.length ? ks[ks.length - 1].v : p._value;
  };
  return p;
}

function Item() {}
function FolderItem(name) {
  this.id = __ae.nextId++;
  this.name = name;
  this.comment = '';
  this.items = [];
  this._parent = null;
}
FolderItem.prototype = new Item();
FolderItem.prototype.constructor = FolderItem;
FolderItem.prototype.item = function (i) { return this.items[i - 1]; };
Object.defineProperty(FolderItem.prototype, 'numItems', { get: function () { return this.items.length; } });

function __move(item, folder) {
  if (item._parent) {
    var list = item._parent.items;
    for (var i = 0; i < list.length; i++) if (list[i] === item) { list.splice(i, 1); break; }
  }
  item._parent = folder;
  folder.items.push(item);
}
Object.defineProperty(Item.prototype, 'parentFolder', {
  get: function () { return this._parent; },
  set: function (f) { __move(this, f); },
});

function FootageItem(path) {
  var m = __ae.media[__norm(path)] || { sec: 0, still: true };
  this.id = __ae.nextId++;
  this.file = new File(path);
  this.name = this.file.name;
  this.comment = '';
  this._parent = null;
  this._sec = m.still ? 0 : m.sec;
  this.mainSource = { isStill: !!m.still, loop: 1 };
}
FootageItem.prototype = new Item();
FootageItem.prototype.constructor = FootageItem;
FootageItem.prototype._ep = [];
Object.defineProperty(FootageItem.prototype, 'duration', { get: function () { return this._sec * this.mainSource.loop; } });
FootageItem.prototype.replace = function (file) {
  this.file = new File(file._path);
  __ae.calls.push('replace ' + this.name + ' -> ' + file._path);
};

// A template comp: ep = [{ name, kind: 'text'|'number'|'media', value }].
function CompItem(name, w, h, duration, fps, ep) {
  this.id = __ae.nextId++;
  this.name = name;
  this.width = w;
  this.height = h;
  this.duration = duration;
  this.frameRate = fps || 25;
  this.frameDuration = 1 / this.frameRate;
  this.time = 0;
  this.comment = '';
  this._parent = null;
  this._layers = [];
  this._ep = ep || [];
  var self = this;
  this.pixelAspect = 1;
  this.workAreaStart = 0;
  this.workAreaDuration = duration;
  this.layers = {
    add: function (src) {
      var l = new AVLayer(self, src);
      self._layers.unshift(l);
      return l;
    },
    addSolid: function (color, name, w, h, pa, dur) {
      var src = { name: name, duration: dur, width: w, height: h, _ep: [], _solid: color, mainSource: new SolidSource(color) };
      var l = new AVLayer(self, src);
      self._layers.unshift(l);
      __ae.calls.push('solid ' + name + ' ' + color.map(function (c) { return Math.round(c * 255); }).join(','));
      return l;
    },
  };
}
CompItem.prototype = new Item();
CompItem.prototype.constructor = CompItem;
CompItem.prototype.layer = function (i) { return this._layers[i - 1]; };
Object.defineProperty(CompItem.prototype, 'numLayers', { get: function () { return this._layers.length; } });
Object.defineProperty(CompItem.prototype, 'selectedLayers', {
  get: function () { return this._layers.filter(function (l) { return l.selected; }); },
});

function __prop(name, value, extra) {
  var p = { name: name, matchName: name, propertyType: PropertyType.PROPERTY, _value: value, _stale: false };
  Object.defineProperty(p, 'value', { get: function () { if (p._stale) throw new Error('Object is invalid'); return p._value; } });
  p.setValue = function (v) { if (p._stale) throw new Error('Object is invalid'); p._value = v; __ae.calls.push('set ' + name); };
  for (var k in extra) p[k] = extra[k];
  return p;
}

function __group(name, props) {
  return {
    name: name,
    matchName: name,
    propertyType: PropertyType.NAMED_GROUP,
    numProperties: props.length,
    property: function (i) { return typeof i === 'number' ? props[i - 1] : null; },
    _props: props,
  };
}

function AVLayer(comp, src) {
  this.id = __ae.nextId++;
  this._comp = comp;
  this.source = src;
  this.name = src.name;
  this.selected = false;
  this._start = 0;
  this.inPoint = 0;
  this._still = !!(src.mainSource && src.mainSource.isStill);
  this._out = this._still ? comp.duration : src.duration;
  this._remap = false;
  this._keys = [];
  this.canSetTimeRemapEnabled = true;
  this._scale = __prop('ADBE Scale', [100, 100]);
  this._fx = [];
  this._text = false;
  this._animators = [];
  this._makeEp();
}
AVLayer.prototype._makeEp = function () {
  var self = this;
  var old = this._epGroup;
  if (old) old._props.forEach(function (p) { p._stale = true; });
  var props = this.source._ep.map(function (d) {
    var prev = old ? old._props.filter(function (p) { return p.name === d.name; })[0] : null;
    var value = prev ? prev._value : (d.kind === 'text' ? new TextDocument(d.value) : d.value);
    var p = __prop(d.name, value, d.kind === 'media' ? { canSetAlternateSource: true, alternateSource: prev ? prev.alternateSource : null } : { canSetAlternateSource: false });
    if (d.kind === 'text') {
      p.setValue = function (v) { if (p._stale) throw new Error('Object is invalid'); p._value = new TextDocument(v.text); };
    }
    if (d.kind === 'media') {
      p.setAlternateSource = function (item) { p.alternateSource = { name: d.name + '_' + item.name, wrapped: item }; };
    }
    return p;
  });
  this._epGroup = __group('ADBE Layer Overrides', props);
  this._epGroup._layer = self;
};
Object.defineProperty(AVLayer.prototype, 'essentialProperty', { get: function () { return this._epGroup; } });
Object.defineProperty(AVLayer.prototype, 'index', {
  get: function () { return this._comp._layers.indexOf(this) + 1; },
});
Object.defineProperty(AVLayer.prototype, 'startTime', {
  get: function () { return this._start; },
  set: function (t) {
    var d = t - this._start;
    this._start = t;
    this.inPoint += d;
    this._out += d;
  },
});
Object.defineProperty(AVLayer.prototype, 'outPoint', {
  get: function () { return this._out; },
  set: function (t) {
    var end = this._start + this.source.duration;
    this._out = this._remap || this._still ? t : Math.min(t, end);
  },
});
Object.defineProperty(AVLayer.prototype, 'timeRemapEnabled', {
  get: function () { return this._remap; },
  set: function (on) {
    if (on && !this._remap) {
      this._keys = [{ t: this.inPoint, v: 0, i: 'linear' }, { t: this._out, v: this.source.duration, i: 'linear' }];
      this._makeEp();
    }
    if (!on) this._keys = [];
    this._remap = !!on;
  },
});
// An effect or a text animator a preset adds: a group with one property keyed at t and t + 0.5 s.
function __keyed(name, t) {
  var p = { name: 'value', propertyType: PropertyType.PROPERTY, numKeys: 2, keyTime: function (k) { return t + (k - 1) * 0.5; } };
  return { name: name, matchName: name, propertyType: PropertyType.NAMED_GROUP, numProperties: 1, property: function (i) { return i === 1 ? p : null; } };
}
function __list(name, items) {
  return { name: name, matchName: name, propertyType: PropertyType.INDEXED_GROUP, numProperties: items.length,
    property: function (i) { return typeof i === 'number' ? items[i - 1] : items.filter(function (x) { return x.matchName === i; })[0] || null; } };
}
// The Fill effect: Fill Mask, All Masks, Color, Invert, feathers, Opacity — Color is the one colour property.
function __fillEffect() {
  var color = __colorProp('Color', 'ADBE Fill-0002', [1, 0, 0, 1]);
  color.propertyValueType = PropertyValueType.COLOR;
  var g = __list('ADBE Fill', [{ name: 'Fill Mask', matchName: 'ADBE Fill-0001', propertyType: PropertyType.PROPERTY, propertyValueType: PropertyValueType.OneD }, color]);
  g.name = 'Fill';
  g._color = color;
  return g;
}
// applyPreset (S4, AE 26.5): every selected layer of the comp; a text preset changes text layers only; with
// nothing selected a new solid gets the preset. __ae.presets[path] = { text: bool }.
AVLayer.prototype.applyPreset = function (file) {
  var preset = __ae.presets[file._path];
  var comp = this._comp;
  var t = comp.time;
  var sel = comp.selectedLayers;
  if (!preset) throw new Error('After Effects error: preset not found');
  __ae.undo.push('applyPreset ' + file.name + ' suppress=' + __ae.suppress);
  if (!sel.length) {
    var solid = comp.layers.addSolid([1, 1, 1], 'White Solid 1', comp.width, comp.height, 1, comp.duration);
    solid._fx.push(__keyed('preset', t));
    return;
  }
  sel.forEach(function (l) {
    if (preset.text && !l._text) return;
    (preset.text ? l._animators : l._fx).push(__keyed(file.name, t));
  });
};
AVLayer.prototype.moveAfter = function (other) {
  var list = this._comp._layers;
  list.splice(list.indexOf(this), 1);
  list.splice(list.indexOf(other) + 1, 0, this);
};
AVLayer.prototype.property = function (name) {
  var self = this;
  if (name === 'ADBE Transform Group') return { property: function (n) { return n === 'ADBE Scale' ? self._scale : null; } };
  if (name === 'ADBE Layer Overrides') return this._epGroup;
  if (name === 'ADBE Effect Parade') {
    if (this._noEffects) return null;
    var fxList = __list('ADBE Effect Parade', this._fx);
    fxList.canAddProperty = function (m) { return m === 'ADBE Fill'; };
    fxList.addProperty = function (m) { var e = __fillEffect(); self._fx.push(e); __ae.calls.push('add effect ' + m); return e; };
    return fxList;
  }
  if (name === 'ADBE Text Properties') {
    if (!this._text) return null;
    var anims = __list('ADBE Text Animators', this._animators);
    var doc = this._sourceText;
    return { name: 'Text', property: function (n) { return n === 'ADBE Text Animators' ? anims : n === 'ADBE Text Document' ? doc : null; } };
  }
  if (name === 'ADBE Root Vectors Group') return this._contents || null;
  if (name === 'ADBE Time Remapping') {
    var sorted = function () { self._keys.sort(function (a, b) { return a.t - b.t; }); };
    return {
      get numKeys() { return self._keys.length; },
      keyTime: function (k) { return self._keys[k - 1].t; },
      keyValue: function (k) { return self._keys[k - 1].v; },
      setValueAtTime: function (t, v) {
        if (!self._remap) throw new Error('time remap is off');
        var hit = self._keys.filter(function (k) { return Math.abs(k.t - t) < 1e-6; })[0];
        if (hit) hit.v = v; else self._keys.push({ t: t, v: v, i: 'bezier' });
        sorted();
      },
      removeKey: function (k) {
        self._keys.splice(k - 1, 1);
        if (!self._keys.length) self._remap = false;
      },
      setInterpolationTypeAtKey: function (k, a) { self._keys[k - 1].i = a === KeyframeInterpolationType.LINEAR ? 'linear' : 'other'; },
    };
  }
  return null;
};

function ImportOptions(file) {
  this.file = file;
  this.importAs = null;
}
ImportOptions.prototype.canImportAs = function (t) {
  return t === ImportAsType.PROJECT ? /\.aep$/i.test(this.file._path) : true;
};

var __root = new FolderItem('Root');

var app = {
  version: '26.5x89',
  buildName: '89',
  isoLanguage: 'ru_RU',
  fonts: {
    getFontsByPostScriptName: function (n) { return __ae.fonts[n] ? [__ae.fonts[n]] : []; },
  },
  beginUndoGroup: function (label) { __ae.undo.push('begin ' + label); },
  endUndoGroup: function () { __ae.undo.push('end'); },
  beginSuppressDialogs: function () { __ae.suppress += 1; },
  endSuppressDialogs: function () { __ae.suppress -= 1; },
  project: {
    file: null,
    activeItem: null,
    rootFolder: __root,
    workingSpace: 'None',
    linearizeWorkingSpace: false,
    bitsPerChannel: 8,
    expressionEngine: 'javascript-1.0',
    items: {
      addFolder: function (name) {
        var f = new FolderItem(name);
        __move(f, __root);
        return f;
      },
    },
    importFile: function (io) {
      var path = io.file._path;
      if (io.importAs === ImportAsType.PROJECT) {
        __ae.imports += 1;
        var folder = __ae.aeps[path]();
        __ae.undo.push('import ' + path.slice(path.lastIndexOf('/') + 1));
        __move(folder, __root);
        return folder;
      }
      var f = new FootageItem(path);
      __move(f, __root);
      __ae.undo.push('import ' + f.name);
      return f;
    },
    itemByID: function (id) {
      var found = null;
      (function walk(folder) {
        folder.items.forEach(function (it) {
          if (it.id === id) found = it;
          if (it instanceof FolderItem) walk(it);
        });
      })(__root);
      return found;
    },
    layerByID: function (id) {
      var found = null;
      (function walk(folder) {
        folder.items.forEach(function (it) {
          if (it instanceof CompItem) it._layers.forEach(function (l) { if (l.id === id) found = l; });
          if (it instanceof FolderItem) walk(it);
        });
      })(__root);
      return found;
    },
  },
};

// Test setup helpers (not part of the AE model).
__ae.userComp = function (w, h, fps, time) {
  var c = new CompItem('Main', w, h, 60, fps, []);
  c.time = time || 0;
  __move(c, __root);
  app.project.activeItem = c;
  return c;
};
// A plain layer in a comp for the effects checks: kind 'text' or 'solid'.
__ae.addLayer = function (comp, name, kind, opts) {
  var src = { name: name, duration: comp.duration, _ep: [], mainSource: { isStill: true } };
  var l = comp.layers.add(src);
  opts = opts || {};
  l._text = kind === 'text';
  if (l._text) {
    var st = __colorProp('Source Text', 'ADBE Text Document', new TextDocument(name), opts.text);
    st.valueAtTime = function () { var d = new TextDocument(st._value.text); d.fillColor = st._value.fillColor; return d; };
    l._sourceText = st;
  }
  // A shape layer: groups with a Fill and a Stroke each; opts.fill / opts.stroke: { keys, expression }.
  if (kind === 'shape') {
    var groups = [];
    for (var g = 0; g < (opts.groups || 1); g++) {
      var fill = __list('ADBE Vector Graphic - Fill', [__colorProp('Color', 'ADBE Vector Fill Color', [1, 0, 0, 1], opts.fill)]);
      fill.name = 'Fill 1';
      var stroke = __list('ADBE Vector Graphic - Stroke', [__colorProp('Color', 'ADBE Vector Stroke Color', [0, 0, 1, 1], opts.stroke)]);
      stroke.name = 'Stroke 1';
      var inner = __list('ADBE Vectors Group', [fill, stroke]);
      inner.name = 'Contents';
      var grp = __list('ADBE Vector Group', [inner]);
      grp.name = 'Rectangle ' + (g + 1);
      grp.propertyType = PropertyType.NAMED_GROUP;
      groups.push(grp);
    }
    l._contents = __list('ADBE Root Vectors Group', groups);
  }
  return l;
};
__ae.addMedia = function (path, sec, still) {
  __ae.files[__norm(path)] = 'media';
  __ae.media[__norm(path)] = { sec: sec, still: !!still };
};
__ae.template = function (aepPath, comps, footage) {
  __ae.files[aepPath] = 'aep';
  __ae.aeps[aepPath] = function () {
    var folder = new FolderItem(aepPath.slice(aepPath.lastIndexOf('/') + 1));
    comps.forEach(function (c) { __move(new CompItem(c.name, c.w, c.h, c.duration, c.fps, c.ep), folder); });
    (footage || []).forEach(function (p) { __ae.files[p] = 'media'; __move(new FootageItem(p), folder); });
    return folder;
  };
};
