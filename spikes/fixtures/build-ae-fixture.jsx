// Builds the shared AE fixture in a NEW project and saves it as PARAMS.fixtureAep (plan part B, task 7).
// Composed after spikes/lib/check.jsx and spikes/lib/ae-project.jsx. ES3 only.
// Every step is a check: a failure is recorded, later steps say "skipped" or fail on their own, and
// nothing runs unless a fresh project was created (a dirty project of the user is never touched).
// Docs: https://ae-scripting.docsforadobe.dev/layer/layercollection/ (add, addText, addSolid, addShape, addNull)
//       https://ae-scripting.docsforadobe.dev/other/markervalue/ (protectedRegion, AE 16.0+)
//       https://ae-scripting.docsforadobe.dev/property/property/ (setPropertyParameters 17.0.1+, propertyParameters 26.0+)
var FX = { ready: false, lt: null, hatch: null, slot: null, exprCount: 0 };

var FX_EXPR = {
  role: 'thisComp.layer("CTRL").effect("ShowRole")(1).value * 100',
  qa: 'thisComp.layer("CTRL").effect("QA")(1).value * 100',
  plateSize: 'var r = thisComp.layer("TXT_NAME").sourceRectAtTime(0, false);\n[r.width + 40, r.height + 40]',
  platePos: 'var r = thisComp.layer("TXT_NAME").sourceRectAtTime(0, false);\n[r.left + r.width / 2, r.top + r.height / 2]',
  plateFill: 'var s = thisComp.layer("CTRL").effect("Style")(1).value;\n' +
    's == 2 ? [0.94902, 0.94902, 0.94902, 1] : [0.13333, 0.13333, 0.13333, 1]',
  hatchOffset: '-100 + time * 0.5',
  probe: 'var d = thisComp.layer("CTRL").effect("Duration")(1).value;\n' +
    'var x = time < d - 1 ? 100 : linear(time, d - 1, d, 100, 200);\n[x, 100]'
};

function fxStep(name, required, fn) {
  return check(name, function () {
    if (!FX.ready) {
      return { pass: false, detail: 'skipped: no fresh project' };
    }
    return fn();
  }, required);
}

function fxRgb(hex) {
  var n = parseInt(String(hex).replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ae-quirks #159: startTime, then inPoint, then outPoint.
function fxSpan(L, d) {
  L.startTime = 0;
  L.inPoint = 0;
  L.outPoint = d;
}

function fxXform(L, matchName) {
  return L.property('ADBE Transform Group').property(matchName);
}

function fxAddEffect(L, matchName, name) {
  L.property('ADBE Effect Parade').addProperty(matchName);
  var parade = L.property('ADBE Effect Parade');      // re-resolve after addProperty (ae-quirks #3)
  parade.property(parade.numProperties).name = name;
  return bkEffect(L, name, matchName);
}

// ae-quirks #9: set the text, then change the LIVE document and set it again.
function fxText(comp, name, str, font, size, xy) {
  var L = comp.layers.addText(str);
  L.name = name;
  var st = bkSourceText(L);
  var doc = st.value;
  doc.text = str;
  st.setValue(doc);
  var live = st.value;
  live.font = font;
  live.fontSize = size;
  live.fillColor = [1, 1, 1];
  live.applyStroke = false;
  // addText takes the alignment last used in the Paragraph panel (centred on this machine), so set it.
  live.justification = ParagraphJustification.LEFT_JUSTIFY;
  st.setValue(live);
  fxSpan(L, comp.duration);
  fxXform(L, 'ADBE Position').setValue(xy);
  return L;
}

// doc.font echoes any name (ae-quirks #80); fontObject.location shows a substitute (times.ttf, #187).
function fxFontInfo(L) {
  var doc = bkSourceText(L).value;
  var fo = null;
  try {
    fo = doc.fontObject;
  } catch (e) {
    fo = null;
  }
  return { font: String(doc.font), file: fo ? String(fo.location) : '' };
}

// Linear in time; spatial keys also get zero tangents, or equal keys drift (ae-quirks #30).
function fxLinear(prop) {
  for (var k = 1; k <= prop.numKeys; k++) {
    prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
    if (prop.isSpatial) {
      var z = (prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL) ? [0, 0, 0] : [0, 0];
      prop.setSpatialAutoBezierAtKey(k, false);
      prop.setSpatialContinuousAtKey(k, false);
      prop.setSpatialTangentsAtKey(k, z, z);
    }
  }
}

function fxKeyList(prop) {
  var out = [];
  for (var k = 1; k <= prop.numKeys; k++) {
    out.push([prop.keyTime(k), prop.keyValue(k)]);
  }
  return out;
}

function fxKeys(prop, pairs) {
  for (var i = 0; i < pairs.length; i++) {
    prop.setValueAtTime(pairs[i][0], pairs[i][1]);
  }
  fxLinear(prop);
  return fxKeyList(prop);
}

function fxSolid(comp, name, hex, w, h, xy) {
  var L = comp.layers.addSolid(fxRgb(hex), name, w, h, 1, comp.duration);
  fxSpan(L, comp.duration);
  fxXform(L, 'ADBE Position').setValue(xy);
  return L;
}

function fxGroup(L, groupName) {
  L.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
  var root = L.property('ADBE Root Vectors Group');
  root.property(root.numProperties).name = groupName;
}

// Adds a shape item to a named group and returns it, fresh (earlier references are stale now).
function fxInGroup(L, groupName, matchName) {
  L.property('ADBE Root Vectors Group').property(groupName).property('ADBE Vectors Group').addProperty(matchName);
  var vecs = L.property('ADBE Root Vectors Group').property(groupName).property('ADBE Vectors Group');
  return vecs.property(vecs.numProperties);
}

function fxShapeProp(L, groupName, itemMatch, propMatch) {
  return L.property('ADBE Root Vectors Group').property(groupName).property('ADBE Vectors Group')
    .property(itemMatch).property(propMatch);
}

// Sets an expression, evaluates it once and returns expressionError ('' when fine).
function fxExpr(prop, src) {
  prop.expression = src;
  prop.valueAtTime(0, false);
  return prop.expressionError;
}

function fxExprReport(list) {
  var bad = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i][1] !== '') {
      bad.push(list[i][0] + ': ' + list[i][1]);
    }
  }
  return { pass: bad.length === 0, detail: bad.length ? bad : 'set ' + list.length + ', no errors' };
}

// CTRL null. full = lower third set (ShowRole, Duration, Accent, Style, QA); else Duration and QA.
function fxCtrl(comp, full) {
  var C = comp.layers.addNull(comp.duration);
  C.name = 'CTRL';
  fxSpan(C, comp.duration);
  if (full) {
    fxAddEffect(C, 'ADBE Checkbox Control', 'ShowRole').property(1).setValue(1);
  }
  fxAddEffect(C, 'ADBE Slider Control', 'Duration').property(1).setValue(10);
  if (full) {
    fxAddEffect(C, 'ADBE Color Control', 'Accent').property(1).setValue([0.14902, 0.81569, 0.48627, 1]);
    var menu = fxAddEffect(C, 'ADBE Dropdown Control', 'Style').property(1);
    if (menu.isDropdownEffect !== true) {
      throw new Error('Style: property 1 is not a dropdown menu');
    }
    menu = menu.setPropertyParameters(['Dark', 'Light']);   // returns the updated Menu property
    // AE 26.5 rebuilds the pseudo effect here (new "Pseudo/@@<id>" match name) and resets its name
    // to "Dropdown Menu Control" (checked live 2026-10-02), so the ASCII name is set again afterwards.
    menu.parentProperty.name = 'Style';
    menu.setValue(1);
  }
  fxAddEffect(C, 'ADBE Checkbox Control', 'QA').property(1).setValue(1);
  return C;
}

function fxCtrlReport(C, expected) {
  var parade = C.property('ADBE Effect Parade');
  var names = [];
  var values = [];
  for (var i = 1; i <= parade.numProperties; i++) {
    names.push(parade.property(i).name);
    values.push(parade.property(i).name + '=' + JSON.stringify(parade.property(i).property(1).value));
  }
  var items = null;
  try {
    items = bkEffect(C, 'Style', 'ADBE Dropdown Control').property(1).propertyParameters;
  } catch (e) {
    items = null;
  }
  var itemsOk = items === null || JSON.stringify(items) === '["Dark","Light"]';
  return { pass: names.join(',') === expected && itemsOk, detail: { effects: values, styleItems: items } };
}

// Classic 3D, as the template contract asks (spec 4.2). Its internal id is "ADBE Advanced 3d"; the newer
// Advanced 3D renderer is "ADBE Calder" (ae-quirks #129). Measured, not assumed: the default renderer of a
// new comp and the list of renderers go into the detail.
// Docs: https://ae-scripting.docsforadobe.dev/item/compitem/ (renderer: one of renderers, read/write)
function fxClassic3d(comp) {
  var was = comp.renderer;
  var list = comp.renderers;
  var found = false;
  for (var i = 0; i < list.length; i++) {
    if (list[i] === 'ADBE Advanced 3d') {
      found = true;
    }
  }
  if (found) {
    comp.renderer = 'ADBE Advanced 3d';
  }
  return { comp: comp.name, defaultRenderer: was, renderers: list.join(', '), now: comp.renderer };
}

function fxSummary(comp) {
  var layers = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    layers.push(comp.layer(i).name);
  }
  return { name: comp.name, size: [comp.width, comp.height], fps: comp.frameRate, duration: comp.duration,
    renderer: comp.renderer, layers: layers, markers: bkMarkers(comp) };
}

check('project: new, expression engine javascript-1.0', function () {
  bkNewProject();
  app.project.expressionEngine = 'javascript-1.0';
  FX.ready = true;
  return { pass: app.project.expressionEngine === 'javascript-1.0',
    detail: 'AE ' + app.version + ', ' + app.isoLanguage + ', ' + app.project.expressionEngine };
}, true);

check('fonts: SB Sans resolve to real files, not times.ttf', function () {
  var names = [PARAMS.fonts.name, PARAMS.fonts.role];
  var out = [];
  var ok = true;
  for (var i = 0; i < names.length; i++) {
    var list = app.fonts.getFontsByPostScriptName(names[i]);
    var loc = list.length ? String(list[0].location) : '';
    if (!list.length || /times\.ttf$/i.test(loc)) {
      ok = false;
    }
    out.push(names[i] + ' -> ' + (loc || 'missing'));
  }
  return { pass: ok, detail: out };
}, false);

if (FX.ready) {
  app.beginUndoGroup('BK build fixture');
}

fxStep('footage: slot_a.png imported (400x400)', true, function () {
  FX.slot = bkQuiet(function () {
    return app.project.importFile(new ImportOptions(new File(PARAMS.media.slotA)));
  });
  return { pass: FX.slot.width === 400 && FX.slot.height === 400,
    detail: FX.slot.name + ' ' + FX.slot.width + 'x' + FX.slot.height };
});

fxStep('comp ' + PARAMS.comps.lt + ': 1920x1080, 25 fps, 10 s', true, function () {
  FX.lt = app.project.items.addComp(PARAMS.comps.lt, PARAMS.w, PARAMS.h, 1, PARAMS.ltDuration, PARAMS.fps);
  return { pass: FX.lt.frameRate === PARAMS.fps && FX.lt.duration === PARAMS.ltDuration,
    detail: FX.lt.width + 'x' + FX.lt.height + ' ' + FX.lt.frameRate + ' fps ' + FX.lt.duration + ' s' };
});

fxStep('LT SLOT_PHOTO: slot_a.png at (1500,540)', true, function () {
  var L = FX.lt.layers.add(FX.slot, FX.lt.duration);
  L.name = 'SLOT_PHOTO';
  fxSpan(L, FX.lt.duration);
  fxXform(L, 'ADBE Position').setValue([1500, 540]);
  return { pass: true, detail: 'index ' + L.index };
});

fxStep('LT TXT_ROLE: SBSansText-Regular 40 px white at (200,870)', true, function () {
  var L = fxText(FX.lt, 'TXT_ROLE', PARAMS.text.role, PARAMS.fonts.role, 40, [200, 870]);
  return { pass: true, detail: fxFontInfo(L) };
});

fxStep('LT TXT_NAME: SBSansDisplay-Semibold 60 px white at (200,800), opacity keys', true, function () {
  var L = fxText(FX.lt, 'TXT_NAME', PARAMS.text.name, PARAMS.fonts.name, 60, [200, 800]);
  var keys = fxKeys(fxXform(L, 'ADBE Opacity'), [[0, 0], [0.5, 100], [9.5, 100], [10, 0]]);
  return { pass: keys.length === 4, detail: { font: fxFontInfo(L), keys: keys } };
});

fxStep('LT PL_NAME: plate parented to TXT_NAME, directly below it', true, function () {
  var T = bkLayer(FX.lt, 'TXT_NAME');
  var S = FX.lt.layers.addShape();
  S.name = 'PL_NAME';
  fxGroup(S, 'Plate');
  fxInGroup(S, 'Plate', 'ADBE Vector Shape - Rect');
  fxInGroup(S, 'Plate', 'ADBE Vector Graphic - Fill');
  S.parent = T;                                     // parent first, then a neutral transform (ae-quirks #15, #29)
  fxXform(S, 'ADBE Anchor Point').setValue([0, 0]);
  fxXform(S, 'ADBE Position').setValue([0, 0]);
  S.moveAfter(T);
  fxSpan(S, FX.lt.duration);
  return { pass: S.index === T.index + 1, detail: 'PL_NAME ' + S.index + ', TXT_NAME ' + T.index };
});

fxStep('LT PROBE_SQ: 40x40 #FF00FF, linear position keys 0/1/9/10 s', true, function () {
  var L = fxSolid(FX.lt, 'PROBE_SQ', '#FF00FF', 40, 40, [100, 100]);
  var keys = fxKeys(fxXform(L, 'ADBE Position'), [[0, [100, 100]], [1, [200, 100]], [9, [200, 100]], [10, [300, 100]]]);
  var at5 = fxXform(L, 'ADBE Position').valueAtTime(5, false);
  return { pass: keys.length === 4 && Math.abs(at5[0] - 200) < 0.001 && Math.abs(at5[1] - 100) < 0.001,
    detail: { keys: keys, at5: at5 } };
});

fxStep('LT QA_PATCH: 100x100 #26D07C at (1820,100)', true, function () {
  var L = fxSolid(FX.lt, 'QA_PATCH', '#26D07C', 100, 100, [1820, 100]);
  return { pass: true, detail: 'index ' + L.index };
});

fxStep('LT CTRL: ShowRole, Duration, Accent, Style (Dark, Light), QA', true, function () {
  return fxCtrlReport(fxCtrl(FX.lt, true), 'ShowRole,Duration,Accent,Style,QA');
});

fxStep('LT expressions: TXT_ROLE, QA_PATCH opacity; PL_NAME size, position, fill', true, function () {
  var P = bkLayer(FX.lt, 'PL_NAME');
  return fxExprReport([
    ['TXT_ROLE opacity', fxExpr(fxXform(bkLayer(FX.lt, 'TXT_ROLE'), 'ADBE Opacity'), FX_EXPR.role)],
    ['QA_PATCH opacity', fxExpr(fxXform(bkLayer(FX.lt, 'QA_PATCH'), 'ADBE Opacity'), FX_EXPR.qa)],
    ['PL_NAME size', fxExpr(fxShapeProp(P, 'Plate', 'ADBE Vector Shape - Rect', 'ADBE Vector Rect Size'), FX_EXPR.plateSize)],
    ['PL_NAME position', fxExpr(fxShapeProp(P, 'Plate', 'ADBE Vector Shape - Rect', 'ADBE Vector Rect Position'), FX_EXPR.platePos)],
    ['PL_NAME fill', fxExpr(fxShapeProp(P, 'Plate', 'ADBE Vector Graphic - Fill', 'ADBE Vector Fill Color'), FX_EXPR.plateFill)]
  ]);
});

fxStep('LT markers: protected regions "in" 0-1 s and "out" 9-10 s', true, function () {
  var mk = FX.lt.markerProperty;
  for (var i = 0; i < PARAMS.markers.length; i++) {
    var m = PARAMS.markers[i];
    var v = new MarkerValue(m.comment);
    v.duration = m.duration;
    v.protectedRegion = true;
    mk.setValueAtTime(m.time, v);
  }
  var got = bkMarkers(FX.lt);
  var ok = got.length === PARAMS.markers.length;
  for (var j = 0; ok && j < got.length; j++) {
    ok = got[j].protectedRegion && got[j].comment === PARAMS.markers[j].comment &&
      Math.abs(got[j].time - PARAMS.markers[j].time) < 0.001 && Math.abs(got[j].duration - PARAMS.markers[j].duration) < 0.001;
  }
  return { pass: ok, detail: got };
});

fxStep('comp ' + PARAMS.comps.hatch + ': 1920x1080, 25 fps, 60 s', true, function () {
  FX.hatch = app.project.items.addComp(PARAMS.comps.hatch, PARAMS.w, PARAMS.h, 1, PARAMS.hatchDuration, PARAMS.fps);
  return { pass: FX.hatch.duration === PARAMS.hatchDuration, detail: FX.hatch.duration + ' s' };
});

fxStep('Hatch layers: HATCH (line + Repeater), PROBE_SQ, QA_PATCH, CTRL (Duration, QA)', true, function () {
  var H = FX.hatch.layers.addShape();
  H.name = 'HATCH';
  fxGroup(H, 'Lines');
  fxInGroup(H, 'Lines', 'ADBE Vector Shape - Rect').property('ADBE Vector Rect Size').setValue([4, PARAMS.h]);
  fxInGroup(H, 'Lines', 'ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').setValue([0.14902, 0.81569, 0.48627, 1]);
  var rep = fxInGroup(H, 'Lines', 'ADBE Vector Filter - Repeater');
  rep.property('ADBE Vector Repeater Copies').setValue(160);
  rep.property('ADBE Vector Repeater Transform').property('ADBE Vector Repeater Position').setValue([40, 0]);
  fxXform(H, 'ADBE Anchor Point').setValue([0, 0]);
  fxXform(H, 'ADBE Position').setValue([0, PARAMS.h / 2]);
  fxSpan(H, FX.hatch.duration);
  fxSolid(FX.hatch, 'PROBE_SQ', '#FF00FF', 40, 40, [100, 100]);
  fxSolid(FX.hatch, 'QA_PATCH', '#26D07C', 100, 100, [1820, 100]);
  return fxCtrlReport(fxCtrl(FX.hatch, false), 'Duration,QA');
});

fxStep('Hatch expressions: Repeater offset, PROBE_SQ position, QA_PATCH opacity', true, function () {
  var H = bkLayer(FX.hatch, 'HATCH');
  return fxExprReport([
    ['HATCH offset', fxExpr(fxShapeProp(H, 'Lines', 'ADBE Vector Filter - Repeater', 'ADBE Vector Repeater Offset'), FX_EXPR.hatchOffset)],
    ['PROBE_SQ position', fxExpr(fxXform(bkLayer(FX.hatch, 'PROBE_SQ'), 'ADBE Position'), FX_EXPR.probe)],
    ['QA_PATCH opacity', fxExpr(fxXform(bkLayer(FX.hatch, 'QA_PATCH'), 'ADBE Opacity'), FX_EXPR.qa)]
  ]);
});

fxStep('comps: Classic 3D renderer (ADBE Advanced 3d)', false, function () {
  var a = fxClassic3d(FX.lt);
  var b = fxClassic3d(FX.hatch);
  return { pass: a.now === 'ADBE Advanced 3d' && b.now === 'ADBE Advanced 3d', detail: [a, b] };
});

fxStep('contract values: plate = TXT_NAME ink box + 40 px; Hatch PROBE_SQ x(9.5 s) = 150', true, function () {
  var r = bkLayer(FX.lt, 'TXT_NAME').sourceRectAtTime(0, false);
  var plate = fxShapeProp(bkLayer(FX.lt, 'PL_NAME'), 'Plate', 'ADBE Vector Shape - Rect', 'ADBE Vector Rect Size')
    .valueAtTime(0, false);
  var probe = fxXform(bkLayer(FX.hatch, 'PROBE_SQ'), 'ADBE Position').valueAtTime(9.5, false);
  var ok = Math.abs(plate[0] - (r.width + 40)) < 0.01 && Math.abs(plate[1] - (r.height + 40)) < 0.01 &&
    Math.abs(probe[0] - 150) < 0.01 && Math.abs(probe[1] - 100) < 0.01;
  return { pass: ok, detail: { ink: [r.left, r.top, r.width, r.height], plate: plate, probeAt9_5: probe } };
});

fxStep('expressions: all 8 evaluate without errors (javascript-1.0)', true, function () {
  var comps = [FX.lt, FX.hatch];
  var bad = [];
  var n = 0;
  for (var c = 0; c < comps.length; c++) {
    var list = bkExpressionProps(comps[c]);
    for (var i = 0; i < list.length; i++) {
      var p = bkResolve(comps[c], list[i]);
      p.valueAtTime(0, false);
      p.valueAtTime(9.6, false);
      n += 1;
      if (p.expressionError !== '') {
        bad.push(comps[c].name + ' ' + list[i].label + ': ' + p.expressionError);
      }
    }
  }
  FX.exprCount = n;
  return { pass: n === 8 && bad.length === 0, detail: { count: n, errors: bad } };
});

if (FX.ready) {
  app.endUndoGroup();
}

fxStep('saved: ' + PARAMS.fixtureAep, true, function () {
  var r = bkSaveAs(PARAMS.fixtureAep);
  return { pass: r.bytes > 0 && r.dirty === false, detail: r };
});

var FX_DATA = { exprCount: FX.exprCount, project: '', comps: [] };
try {
  FX_DATA.project = bkProjectPath();
  FX_DATA.engine = app.project.expressionEngine;
  if (FX.lt) {
    FX_DATA.comps.push(fxSummary(FX.lt));
  }
  if (FX.hatch) {
    FX_DATA.comps.push(fxSummary(FX.hatch));
  }
} catch (e) {
  FX_DATA.error = String(e);
}
finish(FX_DATA);
