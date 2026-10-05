// After Effects stand-in for the adapter tests (tests/panel-host/ae.test.mjs, plan 2026-10-05 task 7): the object
// model panel/host/ae.jsx touches, as plain classes handed to loadAdapter('ae', ae.globals) (vm-host.mjs).
//   const ae = createAe();
//   ae.defineAep('C:/lib/items/X/X_v1.aep', { comps: [{ name: 'CR_X_16x9_v1', eps: [...] }] });
//   const comp = ae.addComp('USER_Comp'); ae.activate(comp);
//   const h = loadAdapter('ae', ae.globals);
// Every mutation is logged with the undo group it ran in (ae.ops(), ae.groups), so a test can check the order of a
// sequence and that one insert is one undo step. The behaviours the adapter is written around are modelled on
// purpose, each from a live finding on AE 26.5:
// - importFile of an .aep as a project gives a FolderItem named after the file, filed at the root;
// - layers.add starts the layer at the CTI, or at 0 with the "create layers at composition start time" preference;
// - without time remap the out point cannot pass the end of the source; enabling time remap adds two keys of AE's
//   own (at the start and at the end of the layer), resets the out point (quirk #133) and invalidates the property
//   objects taken before (the Essential Properties group has to be fetched again); removing every key turns time
//   remap off again; setValueAtTime on an existing key time replaces that key;
// - a text Essential Property is written as doc = p.value; doc.text = s; p.setValue(doc); numbers are 1-based for
//   dropdowns and 0/1 for checkboxes;
// - the app never opens, saves or closes a project here: those calls are recorded in ae.forbidden.
// Everything is built inside createAe, so each mock has its own classes and nothing leaks between tests. With
// { operators: true } every host object inherits AE 26.5's '*', '+', '-' and '/' members (the engine of vm-host.mjs
// gives them to plain objects of its own realm).

const OPERATORS = ['*', '+', '-', '/'];
const SAME = 1e-9;

export const PropertyType = Object.freeze({ PROPERTY: 6212, INDEXED_GROUP: 6213, NAMED_GROUP: 6214 });
export const KeyframeInterpolationType = Object.freeze({ LINEAR: 6612, BEZIER: 6613, HOLD: 6614 });
export const ImportAsType = Object.freeze({ PROJECT: 1, FOOTAGE: 2, COMP: 3, COMP_CROPPED_LAYERS: 4 });

const DEFAULTS = {
  version: '26.5x89',
  language: 'en_US',
  file: 'C:\\Users\\Test\\Projects\\job.aep', // null: an untitled project
  dirty: false,
  workingSpace: 'None',
  linearize: false,
  bpc: 8,
  engine: 'javascript-1.0',
  operators: false,
  createAtCompStart: false,
  canSetRemap: true,
  snapKeys: false, // setValueAtTime rounds the key time to a frame of the comp
  canImportAsProject: true,
  essentialProperty: true, // false: layer.essentialProperty is missing, only property('ADBE Layer Overrides') works
  noEssentialGroup: false, // true: neither of the two gives a group (null)
  ownRemapKeys: null, // (layer) => [[time in layer time, value]] AE adds on enabling time remap; default: both ends
  addFolderParent: null, // a FolderItem: where items.addFolder files a new folder (default: the root)
  importParent: null, // a FolderItem: where importFile files the imported folder (default: the root)
  layersAddThrows: false,
  importThrows: false, // importFile throws before it makes anything
  importThrowsLate: false, // importFile makes its folder and then throws
  importReturnsComp: false, // importFile makes its folder and answers with a comp in it (AE 26.5 answers with the folder)
  moveThrows: false, // setting item.parentFolder throws
  remapIgnored: false, // timeRemapEnabled = true is accepted and does nothing
};

export function createAe(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const files = new Set();
  const aeps = new Map();
  const fontTable = new Map();
  const opLog = []; // { op, group }
  const groups = []; // every undo group: { name, ops, closed }
  const openGroups = [];
  const suppress = { depth: 0, begins: 0, ends: [] };
  const imports = []; // { path, suppressed }
  const forbidden = [];
  let seq = 0; // one counter for the ids of items and layers; it only grows: an item made later has the greater id
  let active = null;

  const record = (op) => {
    const group = openGroups.length ? openGroups[openGroups.length - 1] : null;
    opLog.push({ op, group: group ? group.name : null });
    if (group) group.ops.push(op);
  };
  const base = (path) => String(path).split(/[\\/]/).pop();

  class AeObject {}
  if (cfg.operators) {
    for (const k of OPERATORS) {
      AeObject.prototype[k] = function () {
        throw new Error('Object of type Function found where a Number, Array, or Property is needed');
      };
    }
  }

  class File extends AeObject {
    constructor(path) {
      super();
      this.path = String(path);
      this.fsName = this.path.replace(/\//g, '\\');
    }
    get exists() {
      return files.has(this.path);
    }
  }

  class ImportOptions extends AeObject {
    constructor(file) {
      super();
      this.file = file;
      this.importAs = null;
    }
    canImportAs(type) {
      return type === ImportAsType.PROJECT ? cfg.canImportAsProject : false;
    }
  }

  class TextDocument extends AeObject {
    constructor(text) {
      super();
      this.text = text;
    }
  }

  // ---- project items -------------------------------------------------------------------------------------------
  class Item extends AeObject {
    constructor(name) {
      super();
      this.id = ++seq;
      this.name = name;
      this.comment = '';
      this._parent = null;
    }
    get parentFolder() {
      return this._parent;
    }
    set parentFolder(folder) {
      if (!(folder instanceof FolderItem)) throw new Error('parentFolder must be a FolderItem');
      record(`item.parentFolder ${this.name} -> ${folder.name}`);
      if (cfg.moveThrows) throw new Error('Unable to move the item');
      if (this._parent) this._parent._children.splice(this._parent._children.indexOf(this), 1);
      folder._children.push(this);
      this._parent = folder;
    }
    remove() {
      record(`item.remove ${this.name}`);
      if (this._parent) this._parent._children.splice(this._parent._children.indexOf(this), 1);
      this._parent = null;
    }
  }

  class FolderItem extends Item {
    constructor(name) {
      super(name);
      this._children = [];
    }
    get numItems() {
      return this._children.length;
    }
    item(i) {
      if (i < 1 || i > this._children.length) throw new Error('Index out of range');
      return this._children[i - 1];
    }
  }

  class FootageItem extends Item {}

  const attach = (item, folder) => {
    folder._children.push(item);
    item._parent = folder;
    return item;
  };

  const root = new FolderItem('Root');
  root.id = 0;

  // The Essential Properties of one layer: views over per-layer state; the views die when time remap is enabled.
  class EpProp extends AeObject {
    constructor(layer, state) {
      super();
      this._layer = layer;
      this._epoch = layer._epoch;
      this._s = state;
    }
    _live() {
      if (this._epoch !== this._layer._epoch) throw new Error('Object is invalid');
    }
    get name() {
      this._live();
      return this._s.name;
    }
    get propertyType() {
      this._live();
      return PropertyType.PROPERTY;
    }
    get value() {
      this._live();
      const v = this._s.readTransform ? this._s.readTransform(this._s.value) : this._s.value;
      return this._s.kind === 'text' ? new TextDocument(v) : v;
    }
    setValue(v) {
      this._live();
      record(`ep.setValue ${this._s.name}`);
      if (this._s.throwOnSet) throw new Error('Property is read-only');
      if (this._s.frozen) return;
      if (this._s.kind === 'text') {
        if (!(v instanceof TextDocument)) throw new Error('a text property takes a TextDocument');
        this._s.value = v.text;
      } else {
        if (typeof v !== 'number') throw new Error('a number is needed');
        this._s.value = this._s.clamp && this._s.count ? Math.min(Math.max(v, 1), this._s.count) : v;
      }
    }
  }

  class EpGroup extends AeObject {
    constructor(layer, states, name = 'Essential Properties') {
      super();
      this._layer = layer;
      this._epoch = layer._epoch;
      this._name = name;
      this._kids = states.map((s) => (s.children ? new EpGroup(layer, s.children, s.name) : new EpProp(layer, s)));
    }
    _live() {
      if (this._epoch !== this._layer._epoch) throw new Error('Object is invalid');
    }
    get name() {
      this._live();
      return this._name;
    }
    get propertyType() {
      this._live();
      return PropertyType.NAMED_GROUP;
    }
    get numProperties() {
      this._live();
      return this._kids.length;
    }
    property(i) {
      this._live();
      if (typeof i !== 'number') return this._kids.find((k) => k.name === i) ?? null;
      if (i < 1 || i > this._kids.length) throw new Error('Index out of range');
      return this._kids[i - 1];
    }
  }

  const stateOf = (spec) =>
    spec.children ? { ...spec, children: spec.children.map(stateOf) } : { ...spec };

  class RemapProp extends AeObject {
    constructor(layer) {
      super();
      this._layer = layer;
      this._on = true;
      this._keys = [];
    }
    _live() {
      if (!this._on) throw new Error('Object is invalid');
    }
    get numKeys() {
      this._live();
      return this._keys.length;
    }
    _key(k) {
      this._live();
      if (k < 1 || k > this._keys.length) throw new Error('Index out of range');
      return this._keys[k - 1];
    }
    keyTime(k) {
      return this._key(k).t;
    }
    keyValue(k) {
      return this._key(k).v;
    }
    setValueAtTime(t, v) {
      this._live();
      record(`remap.setValueAtTime ${round(t)} ${round(v)}`);
      if (cfg.snapKeys) {
        const fd = this._layer._comp.frameDuration;
        t = Math.round(t / fd) * fd;
      }
      const same = this._keys.find((k) => Math.abs(k.t - t) < SAME);
      if (same) same.v = v;
      else {
        this._keys.push({ t, v, interp: null });
        this._keys.sort((a, b) => a.t - b.t);
      }
    }
    removeKey(k) {
      const key = this._key(k);
      record(`remap.removeKey ${k}`);
      this._keys.splice(this._keys.indexOf(key), 1);
      if (!this._keys.length) this._layer._remapOff();
    }
    setInterpolationTypeAtKey(k, a, b) {
      const key = this._key(k);
      record(`remap.interp ${k}`);
      key.interp = [a, b];
    }
  }
  const round = (x) => Math.round(x * 1e6) / 1e6;

  class AVLayer extends AeObject {
    constructor(comp, source, start) {
      super();
      this.id = ++seq;
      this.name = source.name;
      this.source = source;
      this._comp = comp;
      this._start = start;
      this._out = start + source.duration;
      this._selected = false;
      this._epoch = 0;
      this._remap = null;
      this._states = (source._eps || []).map(stateOf);
    }
    get index() {
      return this._comp._layers.indexOf(this) + 1;
    }
    get stretch() {
      return 100;
    }
    get startTime() {
      return this._start;
    }
    set startTime(t) {
      record(`layer.startTime ${round(t)}`);
      const d = t - this._start;
      this._start = t;
      this._out += d;
    }
    get inPoint() {
      return this._start;
    }
    get outPoint() {
      return this._out;
    }
    set outPoint(t) {
      record(`layer.outPoint ${round(t)}`);
      // Without time remap a layer cannot run past the end of its source.
      this._out = this._remap ? t : Math.min(t, this._start + this.source.duration);
    }
    get selected() {
      return this._selected;
    }
    set selected(v) {
      record(`layer.selected ${this.name} ${v}`);
      this._selected = !!v;
    }
    get canSetTimeRemapEnabled() {
      return cfg.canSetRemap;
    }
    get timeRemapEnabled() {
      return !!this._remap;
    }
    set timeRemapEnabled(on) {
      record(`layer.timeRemapEnabled ${on}`);
      if (on && !this._remap) {
        if (!cfg.canSetRemap) throw new Error('time remap cannot be enabled');
        if (cfg.remapIgnored) return;
        const d = this.source.duration;
        this._remap = new RemapProp(this);
        const own = cfg.ownRemapKeys ? cfg.ownRemapKeys(this) : [[0, 0], [d, d]];
        this._remap._keys = own.map(([t, v]) => ({ t: this._start + t, v, interp: null }));
        this._out = this._start + d; // enabling resets the out point (quirk #133)
        this._epoch++; // the Essential Properties group taken before is no longer valid
      } else if (!on) {
        this._remapOff();
      }
    }
    _remapOff() {
      if (this._remap) this._remap._on = false;
      this._remap = null;
      this._epoch++;
    }
    get essentialProperty() {
      if (cfg.noEssentialGroup) return null;
      return cfg.essentialProperty ? new EpGroup(this, this._states) : undefined;
    }
    property(name) {
      if (name === 'ADBE Time Remapping') return this._remap;
      if (name === 'ADBE Layer Overrides') return cfg.noEssentialGroup ? null : new EpGroup(this, this._states);
      return null;
    }
    remove() {
      record(`layer.remove ${this.name}`);
      this._comp._layers.splice(this._comp._layers.indexOf(this), 1);
    }
    // test helpers (not AE API)
    epValue(name) {
      const find = (list) => {
        for (const s of list) {
          const hit = s.children ? find(s.children) : s.name === name ? s : null;
          if (hit) return hit;
        }
        return null;
      };
      const s = find(this._states);
      return s ? s.value : undefined;
    }
    remapKeys() {
      return this._remap ? this._remap._keys.map((k) => [round(k.t - this._start), round(k.v)]) : null;
    }
    remapInterp() {
      return this._remap ? this._remap._keys.map((k) => k.interp) : null;
    }
  }

  class CompItem extends Item {
    constructor(name, { w = 1920, h = 1080, fps = 25, duration = 10, eps = [] } = {}) {
      super(name);
      this.width = w;
      this.height = h;
      this.frameRate = fps;
      this.duration = duration;
      this.time = 0;
      this._eps = eps;
      this._layers = [];
      const comp = this;
      this.layers = {
        add(item) {
          if (cfg.layersAddThrows) throw new Error('layers.add failed');
          if (!(item instanceof CompItem)) throw new Error('layers.add: not a comp');
          record(`layers.add ${item.name}`);
          const layer = new AVLayer(comp, item, cfg.createAtCompStart ? 0 : comp.time);
          comp._layers.unshift(layer); // the new layer is the top one
          return layer;
        },
      };
    }
    get frameDuration() {
      return 1 / this.frameRate;
    }
    get numLayers() {
      return this._layers.length;
    }
    layer(i) {
      if (i < 1 || i > this._layers.length) throw new Error('Index out of range');
      return this._layers[i - 1];
    }
    get selectedLayers() {
      return this._layers.filter((l) => l.selected);
    }
  }

  const everything = () => {
    const out = [];
    const walk = (f) => {
      for (const c of f._children) {
        out.push(c);
        if (c instanceof FolderItem) walk(c);
      }
    };
    walk(root);
    return out;
  };

  const items = {
    addFolder(name) {
      record(`items.addFolder ${name}`);
      return attach(new FolderItem(name), cfg.addFolderParent || root);
    },
    // items.addComp(name, width, height, pixelAspect, duration, frameRate)
    addComp(name, w, h, pixelAspect, duration, fps) {
      record(`items.addComp ${name}`);
      return attach(new CompItem(name, { w, h, fps, duration }), cfg.addFolderParent || root);
    },
  };

  class Project extends AeObject {
    get file() {
      return cfg.file === null ? null : new File(cfg.file);
    }
    get dirty() {
      return cfg.dirty;
    }
    get rootFolder() {
      return root;
    }
    get items() {
      return items;
    }
    get numItems() {
      return everything().length;
    }
    item(i) {
      const all = everything();
      if (i < 1 || i > all.length) throw new Error('Index out of range');
      return all[i - 1];
    }
    itemByID(id) {
      return everything().find((it) => it.id === id) ?? null;
    }
    get activeItem() {
      return active;
    }
    get workingSpace() {
      return cfg.workingSpace;
    }
    get linearizeWorkingSpace() {
      return cfg.linearize;
    }
    get bitsPerChannel() {
      return cfg.bpc;
    }
    get expressionEngine() {
      return cfg.engine;
    }
    importFile(io) {
      record(`importFile ${io.file.path}`);
      imports.push({ path: io.file.path, suppressed: suppress.depth > 0 });
      if (cfg.importThrows) throw new Error('After Effects error: unable to import the file');
      if (io.importAs !== ImportAsType.PROJECT) throw new Error('the file was imported as footage');
      if (!io.file.exists) throw new Error('File not found');
      const spec = aeps.get(io.file.path);
      if (!spec) throw new Error('not an After Effects project');
      const folder = attach(new FolderItem(base(io.file.path)), cfg.importParent || root);
      attach(new FolderItem('Solids'), folder);
      const subs = new Map();
      for (const c of spec.comps) {
        let parent = folder;
        if (c.folder) {
          if (!subs.has(c.folder)) subs.set(c.folder, attach(new FolderItem(c.folder), folder));
          parent = subs.get(c.folder);
        }
        attach(new CompItem(c.name, c), parent);
      }
      if (cfg.importThrowsLate) throw new Error('After Effects error: the import did not finish');
      if (cfg.importReturnsComp) {
        const comps = [];
        const walk = (f) => f._children.forEach((c) => (c instanceof FolderItem ? walk(c) : comps.push(c)));
        walk(folder);
        return comps[0];
      }
      return folder;
    }
    open() {
      forbidden.push('project.open');
    }
    save() {
      forbidden.push('project.save');
    }
    close() {
      forbidden.push('project.close');
    }
  }

  const project = new Project();

  const fonts = {
    getFontsByPostScriptName(ps) {
      return (fontTable.get(ps) || []).map((f) => Object.assign(new AeObject(), { postScriptName: ps, ...f }));
    },
  };

  const app = Object.assign(new AeObject(), {
    version: cfg.version,
    isoLanguage: cfg.language,
    project,
    fonts,
    beginUndoGroup(name) {
      const group = { name, ops: [], closed: false };
      groups.push(group);
      openGroups.push(group);
    },
    endUndoGroup() {
      const group = openGroups.pop();
      if (!group) throw new Error('endUndoGroup without beginUndoGroup');
      group.closed = true;
    },
    beginSuppressDialogs() {
      suppress.depth++;
      suppress.begins++;
    },
    endSuppressDialogs(showAlert) {
      suppress.depth--;
      suppress.ends.push(showAlert);
    },
    open() {
      forbidden.push('app.open');
    },
    newProject() {
      forbidden.push('app.newProject');
    },
  });

  return {
    cfg, // change an option in a test: ae.cfg.snapKeys = true
    app,
    root,
    globals: {
      app, CompItem, FolderItem, FootageItem, File, ImportOptions, ImportAsType, PropertyType, KeyframeInterpolationType,
    },
    suppress,
    imports,
    groups,
    forbidden,
    // Every mutation so far, in order: ae.ops() or ae.ops('layer.') filtered by prefix.
    ops: (prefix = '') => opLog.filter((o) => o.op.startsWith(prefix)).map((o) => o.op),
    // The same with the undo group each ran in (null: outside any group).
    opsWithGroup: () => opLog.map((o) => ({ ...o })),
    openGroupCount: () => openGroups.length,
    // A project file that exists on disk, and an .aep that importFile can read: { comps: [{ name, w, h, fps,
    // duration, eps, folder }] }; each import makes a folder named after the file with these comps in it.
    addFile: (path) => files.add(path),
    defineAep(path, spec) {
      files.add(path);
      aeps.set(path, spec);
    },
    addComp(name, spec, parent = root) {
      return attach(new CompItem(name, spec), parent);
    },
    addFolder: (name, parent = root) => attach(new FolderItem(name), parent),
    addFootage: (name, parent = root) => attach(new FootageItem(name), parent),
    activate(item) {
      active = item;
    },
    setFonts: (ps, list) => fontTable.set(ps, list),
    // The root bin of the panel, or null.
    bin: () => root._children.find((c) => c instanceof FolderItem && c.name === 'Cloud.ru BrandKit') ?? null,
    classes: { CompItem, FolderItem, AVLayer, EpGroup },
  };
}

// ---- the pack-1 templates, as the library describes them -----------------------------------------------------------

// Essential Properties of an instance list the newest controller first (library fields in reverse).
export const TTL_EPS = [
  { name: 'Размер текста', kind: 'dropdown', value: 2, count: 5 },
  { name: 'Скорость', kind: 'dropdown', value: 2, count: 5 },
  { name: 'Сторона', kind: 'dropdown', value: 1, count: 2 },
  { name: 'Стиль', kind: 'dropdown', value: 1, count: 3 },
  { name: 'Должность, 2-я строка', kind: 'text', value: '' },
  { name: 'Должность', kind: 'text', value: 'Должность' },
  { name: 'Имя', kind: 'text', value: 'Имя Фамилия' },
];

export const MARK_EPS = [
  { name: 'Скорость', kind: 'dropdown', value: 2, count: 5 },
  { name: 'Фон', kind: 'dropdown', value: 1, count: 3 },
  { name: 'Тема', kind: 'dropdown', value: 2, count: 2 },
  { name: 'Подложка', kind: 'checkbox', value: 1 },
];

// TTL_LowerThird: D = 6 s (intro 2.2, outro 2), four variants. extra: more fields of each comp.
export function ttlAep({ eps = TTL_EPS, version = 1, fps = 25, duration = 6, nested = false } = {}) {
  const variants = [
    ['16x9', 1920, 1080],
    ['16x9_4K', 3840, 2160],
    ['9x16', 1080, 1920],
    ['1x1', 1080, 1080],
  ];
  return {
    comps: variants.map(([key, w, h]) => ({
      name: `CR_TTL_LowerThird_${key}_v${version}`, w, h, fps, duration, eps, folder: nested ? 'Variants' : undefined,
    })),
  };
}

// LOGO_Mark: D = 4 s (intro 2.96, outro 0.8).
export function markAep({ eps = MARK_EPS } = {}) {
  return {
    comps: [
      { name: 'CR_LOGO_Mark_16x9_v1', w: 1920, h: 1080, fps: 25, duration: 4, eps },
      { name: 'CR_LOGO_Mark_9x16_v1', w: 1080, h: 1920, fps: 25, duration: 4, eps },
    ],
  };
}
