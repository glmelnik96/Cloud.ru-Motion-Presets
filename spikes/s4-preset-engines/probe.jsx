// S4: applyPreset with and without a selection, and every fixture expression in both engines (spec 3.1).
// Composed after check.jsx and ae-project.jsx. ES3. Works on the fixture opened from disk and saves the
// result as a scratch copy (PARAMS.s4Aep): the fixture file itself is never changed.
// Docs: https://ae-scripting.docsforadobe.dev/layer/layer/ (applyPreset: selected layers of the comp; no
//       selection -> a new solid), https://ae-scripting.docsforadobe.dev/general/project/ (expressionEngine,
//       "extendscript" | "javascript-1.0", AE 16.0+),
//       https://ae-scripting.docsforadobe.dev/property/propertybase/ (selected, read/write; a layer has it too),
//       https://ae-scripting.docsforadobe.dev/item/avitem/ (time: the current time, read/write).
var S4 = { open: false, lt: null, hatch: null, engine0: null, exprs: [], engines: {} };

function s4Guard(fn) {
  return function () {
    if (!S4.open) {
      return { pass: false, detail: 'skipped: fixture not open' };
    }
    return fn();
  };
}

function s4Deselect(comp) {
  for (var i = 1; i <= comp.numLayers; i++) {
    comp.layer(i).selected = false;
  }
}

function s4SelectedNames(comp) {
  var sel = comp.selectedLayers;
  var out = [];
  for (var i = 0; i < sel.length; i++) {
    out.push(sel[i].name);
  }
  return out;
}

// Number of effects per layer name (layer names are unique in the fixture).
function s4EffectCounts(comp) {
  var out = {};
  for (var i = 1; i <= comp.numLayers; i++) {
    var n = 0;
    try {
      n = comp.layer(i).property('ADBE Effect Parade').numProperties;
    } catch (e) {
      n = 0;
    }
    out[comp.layer(i).name] = n;
  }
  return out;
}

// Layer names whose effect count differs between two s4EffectCounts results.
function s4Changed(before, after) {
  var out = [];
  for (var k in after) {
    if (after.hasOwnProperty(k) && after[k] !== before[k]) {
      out.push(k);
    }
  }
  return out;
}

// Earliest first keyframe under a property group: { t, at } or null. A group that refuses to enumerate
// is skipped (as in bkExpressionProps) instead of failing the whole search.
function s4FirstKey(group, label) {
  var best = null;
  var count = 0;
  try {
    count = group.numProperties;
  } catch (e0) {
    count = 0;
  }
  for (var i = 1; i <= count; i++) {
    var p = null;
    try {
      p = group.property(i);
    } catch (e1) {
      p = null;
    }
    if (p === null) {
      continue;
    }
    var here = label + '/' + p.matchName;
    if (p.propertyType === PropertyType.PROPERTY) {
      var n = 0;
      try {
        n = p.numKeys;
      } catch (e) {
        n = 0;
      }
      if (n > 0 && (best === null || p.keyTime(1) < best.t)) {
        best = { t: p.keyTime(1), at: here };
      }
    } else {
      var sub = s4FirstKey(p, here);
      if (sub !== null && (best === null || sub.t < best.t)) {
        best = sub;
      }
    }
  }
  return best;
}

function s4LayerNames(comp) {
  var out = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    out.push(comp.layer(i).name);
  }
  return out;
}

// Layer.applyPreset(File) with script-error dialogs suppressed (bkQuiet); it returns nothing (docs).
function s4Apply(layer, presetPath) {
  bkQuiet(function () {
    layer.applyPreset(new File(presetPath));
  });
}

// Switches the engine, evaluates every expression at several times, then re-sets the same source to force
// a recompile under this engine and reads expressionError again.
function s4Engine(engine) {
  app.project.expressionEngine = engine;
  var bad = [];
  for (var i = 0; i < S4.exprs.length; i++) {
    var e = S4.exprs[i];
    var p = bkResolve(e.comp, e.entry);
    for (var k = 0; k < PARAMS.evalTimes.length; k++) {
      if (PARAMS.evalTimes[k] < e.comp.duration) {
        p.valueAtTime(PARAMS.evalTimes[k], false);
      }
    }
    if (p.expressionError !== '') {
      bad.push(e.name + ' (evaluated): ' + p.expressionError);
    }
    var src = p.expression;
    p.expression = src;
    p.valueAtTime(0, false);
    if (p.expressionError !== '') {
      bad.push(e.name + ' (recompiled): ' + p.expressionError);
    }
  }
  S4.engines[engine] = { count: S4.exprs.length, errors: bad, engineNow: app.project.expressionEngine };
  return { pass: app.project.expressionEngine === engine && S4.exprs.length > 0 && bad.length === 0, detail: S4.engines[engine] };
}

check('fixture opened from disk', function () {
  bkOpenProject(PARAMS.fixtureAep);
  S4.lt = bkComp(PARAMS.comps.lt);
  S4.hatch = bkComp(PARAMS.comps.hatch);
  S4.engine0 = app.project.expressionEngine;
  S4.open = true;
  return { pass: true, detail: bkProjectPath() + ', engine ' + S4.engine0 };
}, true);

if (S4.open) {
  app.beginUndoGroup('BK S4 presets and engines');
}

check('fixture expressions found (expected ' + PARAMS.expectedExpressions + ')', s4Guard(function () {
  var comps = [S4.lt, S4.hatch];
  for (var c = 0; c < comps.length; c++) {
    var list = bkExpressionProps(comps[c]);
    for (var i = 0; i < list.length; i++) {
      S4.exprs.push({ comp: comps[c], entry: list[i], name: comps[c].name + ' ' + list[i].label });
    }
  }
  var names = [];
  for (var j = 0; j < S4.exprs.length; j++) {
    names.push(S4.exprs[j].name);
  }
  return { pass: S4.exprs.length === PARAMS.expectedExpressions, detail: names };
}), true);

check('engine extendscript: every expression without errors', s4Guard(function () {
  return s4Engine('extendscript');
}), true);

check('engine javascript-1.0: every expression without errors', s4Guard(function () {
  return s4Engine('javascript-1.0');
}), true);

check('effect value without .value (bare property arithmetic) in both engines', s4Guard(function () {
  var L = S4.lt.layers.addNull(S4.lt.duration);
  L.name = 'BK_BARE';
  var op = L.property('ADBE Transform Group').property('ADBE Opacity');
  var out = {};
  var ok = true;
  var engines = ['extendscript', 'javascript-1.0'];
  try {
    for (var i = 0; i < engines.length; i++) {
      app.project.expressionEngine = engines[i];
      op.expression = 'var d = thisComp.layer("CTRL").effect("Duration")(1);\n' +
        'd - 1 > 0 ? thisComp.layer("CTRL").effect("QA")(1) * 100 : 0';
      var v = op.valueAtTime(0, false);
      out[engines[i]] = { error: op.expressionError, value: v };
      if (op.expressionError !== '' || Math.abs(v - 100) > 0.001) {
        ok = false;
      }
    }
  } finally {
    L.remove();
    app.project.expressionEngine = 'javascript-1.0';
  }
  return { pass: ok, detail: out };
}), false);

check('applyPreset, TXT_ROLE selected: preset lands on TXT_ROLE only', s4Guard(function () {
  var L = bkLayer(S4.lt, 'TXT_ROLE');
  var before = s4LayerNames(S4.lt);
  var fxBefore = s4EffectCounts(S4.lt);
  S4.lt.openInViewer();
  s4Deselect(S4.lt);
  L.selected = true;
  S4.lt.time = PARAMS.times.selected;
  var selected = s4SelectedNames(S4.lt);
  var timeSet = S4.lt.time;
  s4Apply(L, PARAMS.presets.generic);
  var after = s4LayerNames(S4.lt);
  var changed = s4Changed(fxBefore, s4EffectCounts(S4.lt));
  return { pass: after.length === before.length && changed.length === 1 && changed[0] === 'TXT_ROLE',
    detail: { selected: selected, compTime: timeSet, layersBefore: before.length, layersAfter: after.length,
      effectsChangedOn: changed } };
}), true);

check('applyPreset: first keyframe at comp.time (' + PARAMS.times.selected + ' s)', s4Guard(function () {
  var first = s4FirstKey(bkLayer(S4.lt, 'TXT_ROLE').property('ADBE Effect Parade'), 'TXT_ROLE/effects');
  var half = S4.lt.frameDuration / 2;
  return { pass: first !== null && Math.abs(first.t - PARAMS.times.selected) < half, detail: first };
}), true);

check('text preset on TXT_NAME selected: animator keys start at comp.time (' + PARAMS.times.text + ' s)', s4Guard(function () {
  var L = bkLayer(S4.lt, 'TXT_NAME');
  s4Deselect(S4.lt);
  L.selected = true;
  S4.lt.time = PARAMS.times.text;
  s4Apply(L, PARAMS.presets.text);
  var animators = bkLayer(S4.lt, 'TXT_NAME').property('ADBE Text Properties').property('ADBE Text Animators');
  var first = s4FirstKey(animators, 'TXT_NAME/animators');
  var half = S4.lt.frameDuration / 2;
  return { pass: animators.numProperties > 0 && first !== null && Math.abs(first.t - PARAMS.times.text) < half,
    detail: { animators: animators.numProperties, first: first } };
}), false);

check('applyPreset with nothing selected: a new solid layer appears', s4Guard(function () {
  var ids = [];
  for (var b = 1; b <= S4.lt.numLayers; b++) {
    ids.push(S4.lt.layer(b).id);                      // Layer.id: persistent, AE 22.0+
  }
  s4Deselect(S4.lt);
  S4.lt.time = PARAMS.times.none;
  var selected = s4SelectedNames(S4.lt);
  s4Apply(bkLayer(S4.lt, 'SLOT_PHOTO'), PARAMS.presets.generic);
  var fresh = null;
  for (var i = 1; i <= S4.lt.numLayers; i++) {
    var known = false;
    for (var j = 0; j < ids.length; j++) {
      if (ids[j] === S4.lt.layer(i).id) {
        known = true;
      }
    }
    if (!known) {
      fresh = S4.lt.layer(i);
    }
  }
  var solid = false;
  var first = null;
  if (fresh !== null) {
    solid = fresh.source instanceof FootageItem && fresh.source.mainSource instanceof SolidSource;
    first = s4FirstKey(fresh.property('ADBE Effect Parade'), 'new layer/effects');
  }
  return { pass: S4.lt.numLayers === ids.length + 1 && solid,
    detail: { selectedBefore: selected, layersBefore: ids.length, layersAfter: S4.lt.numLayers,
      newLayer: fresh ? fresh.name : null, solid: solid, firstKey: first } };
}), false);

if (S4.open) {
  app.endUndoGroup();
}

check('engine restored and scratch copy saved', s4Guard(function () {
  app.project.expressionEngine = S4.engine0;
  var r = bkSaveAs(PARAMS.s4Aep);
  return { pass: app.project.expressionEngine === S4.engine0 && r.dirty === false, detail: r };
}), false);

finish({ engineBefore: S4.engine0, engines: S4.engines, presets: PARAMS.presets, times: PARAMS.times });
