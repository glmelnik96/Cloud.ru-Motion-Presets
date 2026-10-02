// Builds CR_LOGO_Mark, the logo without a caption, in a NEW project and saves it as PARAMS.out.aep.
// Composed after spikes/lib/check.jsx, spikes/lib/ae-project.jsx and tools/masters/jsx/ae-build-lib.jsx;
// PARAMS come from masters/LOGO_Mark/resolve.mjs. CUBE, WORDMARK, WIPE (inverted matte of the wordmark) and
// PLATE share one transform: anchor in the pack's cube-layer units, position and scale from the RIG sliders
// (the pack's curves; set A without the plate, set B with it). Flat, top level, no 3D.
var LM = { ready: false, comp: null };
var LM_SHARED = ['PLATE', 'CUBE', 'WIPE', 'WORDMARK'];

function lmStep(name, required, fn) {
  return check(name, function () {
    if (!LM.ready) {
      return { pass: false, detail: 'skipped: no fresh project' };
    }
    return fn();
  }, required);
}

function lmLayer(name) {
  return bkLayer(LM.comp, name);
}

function lmRect(L, group, hex) {
  bdGroup(L, group);
  bdRect(L, group, 'Rect');
  bdFill(L, group, hex, 'Fill');
}

function lmRectProp(name, group, item, matchName) {
  return bdGroupItem(lmLayer(name), group, item).property(matchName);
}

check('project: new, expression engine javascript-1.0', function () {
  bkNewProject();
  app.project.expressionEngine = 'javascript-1.0';
  LM.ready = true;
  return { pass: app.project.expressionEngine === 'javascript-1.0', detail: 'AE ' + app.version };
}, true);

lmStep('project colour: 8 bpc, no working space, no linearization, no linear blending', true, function () {
  return bdProjectColour();
});

if (LM.ready) {
  app.beginUndoGroup('BK build ' + PARAMS.id);
}

lmStep('comp ' + PARAMS.comp.name + ': ' + PARAMS.comp.w + 'x' + PARAMS.comp.h + ', ' + PARAMS.comp.fps + ' fps, ' + PARAMS.comp.duration + ' s, no motion blur', true, function () {
  var c = PARAMS.comp;
  LM.comp = app.project.items.addComp(c.name, c.w, c.h, 1, c.duration, c.fps);
  LM.comp.bgColor = [0, 0, 0];
  LM.comp.motionBlur = false;
  LM.comp.workAreaStart = 0;
  LM.comp.workAreaDuration = c.duration;
  bdClassic3d(LM.comp);
  return { pass: LM.comp.frameRate === c.fps && Math.abs(LM.comp.duration - c.duration) < 1e-6, detail: LM.comp.width + 'x' + LM.comp.height };
});

lmStep('layers: BG, PLATE, CUBE, WIPE, WORDMARK (master logo), QA_PATCH (geometry only)', true, function () {
  var i;
  lmRect(bdShapeLayer(LM.comp, 'BG'), 'Plate', PARAMS.hex.black);
  lmRect(bdShapeLayer(LM.comp, 'PLATE'), 'Plate', PARAMS.hex.black);
  var C = bdShapeLayer(LM.comp, 'CUBE');
  bdGroup(C, 'Cube');
  for (i = 0; i < PARAMS.lockup.cube.length; i++) {
    bdPath(C, 'Cube', PARAMS.lockup.cube[i], 'Path ' + (i + 1));
  }
  bdFill(C, 'Cube', PARAMS.hex.green, 'Fill');
  lmRect(bdShapeLayer(LM.comp, 'WIPE'), 'Wipe', PARAMS.hex.black);
  var Wd = bdShapeLayer(LM.comp, 'WORDMARK');
  bdGroup(Wd, 'Wordmark');
  for (i = 0; i < PARAMS.lockup.wordmark.length; i++) {
    bdPath(Wd, 'Wordmark', PARAMS.lockup.wordmark[i], 'Path ' + (i + 1));
  }
  bdFill(Wd, 'Wordmark', PARAMS.hex.white, 'Fill');
  lmRect(bdShapeLayer(LM.comp, 'QA_PATCH'), 'Patch', PARAMS.hex.green);
  for (i = 0; i < LM_SHARED.length; i++) {
    bdXform(lmLayer(LM_SHARED[i]), 'ADBE Anchor Point').setValue(PARAMS.layout.anchor);
  }
  return { pass: true, detail: { cube: PARAMS.lockup.cube.length, wordmark: PARAMS.lockup.wordmark.length } };
});

lmStep('RIG: the pack curves of both animations and the outro (shy, not in Essential Graphics)', true, function () {
  var L = bdNull(LM.comp, 'RIG');
  L.shy = true;
  var out = {};
  for (var name in PARAMS.rig) {
    if (PARAMS.rig.hasOwnProperty(name)) {
      bdSlider(L, name, 0);
      out[name] = bdKeys(bkEffect(L, name, 'ADBE Slider Control').property(1), PARAMS.rig[name]);
    }
  }
  return { pass: true, detail: out };
});

lmStep('CTRL: Plate (checkbox), Theme, Background (dropdowns, Cyrillic items), QA', true, function () {
  var L = bdNull(LM.comp, 'CTRL');
  bdCheckbox(L, 'Plate', PARAMS.ctrl.Plate.value === 1);
  var got = {};
  var ok = true;
  var names = ['Theme', 'Background'];
  for (var i = 0; i < names.length; i++) {
    var spec = PARAMS.ctrl[names[i]];
    var r = bdDropdown(L, names[i], spec.items, spec.value);
    got[names[i]] = r.items;
    ok = ok && r.items !== null && r.items.join('|') === spec.items.join('|');
  }
  bdCheckbox(L, 'QA', false);
  return { pass: ok, detail: got };
});

// Expressions go in last: one that names a missing layer is disabled by AE on the spot.
lmStep('expressions: shared transform, wipe, plate, colours, background, QA patch', true, function () {
  var X = PARAMS.expr;
  var list = [];
  for (var i = 0; i < LM_SHARED.length; i++) {
    list.push([LM_SHARED[i] + ' position', bdXform(lmLayer(LM_SHARED[i]), 'ADBE Position'), X.position]);
    list.push([LM_SHARED[i] + ' scale', bdXform(lmLayer(LM_SHARED[i]), 'ADBE Scale'), X.scale]);
  }
  list.push(['CUBE opacity', bdXform(lmLayer('CUBE'), 'ADBE Opacity'), X.cubeOpacity]);
  list.push(['WIPE size', lmRectProp('WIPE', 'Wipe', 'Rect', 'ADBE Vector Rect Size'), X.wipeSize]);
  list.push(['WIPE position', lmRectProp('WIPE', 'Wipe', 'Rect', 'ADBE Vector Rect Position'), X.wipePos]);
  list.push(['PLATE size', lmRectProp('PLATE', 'Plate', 'Rect', 'ADBE Vector Rect Size'), X.plateSize]);
  list.push(['PLATE position', lmRectProp('PLATE', 'Plate', 'Rect', 'ADBE Vector Rect Position'), X.platePos]);
  list.push(['PLATE fill', lmRectProp('PLATE', 'Plate', 'Fill', 'ADBE Vector Fill Color'), X.plateFill]);
  list.push(['WORDMARK fill', bdGroupItem(lmLayer('WORDMARK'), 'Wordmark', 'Fill').property('ADBE Vector Fill Color'), X.wordFill]);
  list.push(['BG size', lmRectProp('BG', 'Plate', 'Rect', 'ADBE Vector Rect Size'), X.bgSize]);
  list.push(['BG position', lmRectProp('BG', 'Plate', 'Rect', 'ADBE Vector Rect Position'), X.bgPos]);
  list.push(['BG fill', lmRectProp('BG', 'Plate', 'Fill', 'ADBE Vector Fill Color'), X.bgFill]);
  list.push(['BG opacity', bdXform(lmLayer('BG'), 'ADBE Opacity'), X.bgOpacity]);
  list.push(['QA_PATCH size', lmRectProp('QA_PATCH', 'Patch', 'Rect', 'ADBE Vector Rect Size'), X.qaSize]);
  list.push(['QA_PATCH position', lmRectProp('QA_PATCH', 'Patch', 'Rect', 'ADBE Vector Rect Position'), X.qaPos]);
  list.push(['QA_PATCH opacity', bdXform(lmLayer('QA_PATCH'), 'ADBE Opacity'), X.qaOpacity]);
  var bad = [];
  for (var j = 0; j < list.length; j++) {
    var err = bdExpr(list[j][1], list[j][2]);
    if (err !== '' || list[j][1].expressionEnabled !== true) {
      bad.push(list[j][0] + ': ' + (err || 'disabled'));
    }
  }
  return { pass: bad.length === 0, detail: { set: list.length, errors: bad } };
});

lmStep('matte: WORDMARK by the inverted alpha of WIPE (WIPE stays hidden)', true, function () {
  var r = bdMatte(lmLayer('WORDMARK'), lmLayer('WIPE'), 'ALPHA_INVERTED');
  return { pass: r.matte === 'WIPE' && lmLayer('WIPE').enabled === false, detail: r };
});

lmStep('markers: protected regions in / out', true, function () {
  var got = bdMarkers(LM.comp, PARAMS.markers);
  var ok = got.length === PARAMS.markers.length;
  for (var j = 0; ok && j < got.length; j++) {
    ok = got[j].protectedRegion && got[j].comment === PARAMS.markers[j].comment &&
      Math.abs(got[j].time - PARAMS.markers[j].time) < 1e-3 && Math.abs(got[j].duration - PARAMS.markers[j].duration) < 1e-3;
  }
  return { pass: ok, detail: got };
});

lmStep('layer order and switches: flat, no motion blur, startTime 0', true, function () {
  var want = ['CTRL', 'RIG', 'QA_PATCH', 'WORDMARK', 'WIPE', 'CUBE', 'PLATE', 'BG'];
  var names = [];
  var bad = [];
  for (var i = 1; i <= LM.comp.numLayers; i++) {
    var L = LM.comp.layer(i);
    names.push(L.name);
    if (L.motionBlur) {
      bad.push(L.name + ': motion blur');
    }
    if (L.startTime !== 0) {
      bad.push(L.name + ': startTime ' + L.startTime);
    }
  }
  return { pass: names.join(',') === want.join(',') && bad.length === 0, detail: { order: names, problems: bad } };
});

lmStep('expressions: every one evaluates without errors at the sweep times', true, function () {
  var r = bdExprSweep(LM.comp, PARAMS.sweepTimes);
  return { pass: r.errors.length === 0, detail: r };
});

lmStep('rest layout at ' + PARAMS.rest + ' s: cube, wordmark and plate where the pack has them', true, function () {
  var t = PARAMS.rest;
  var box = function (n) {
    var L = lmLayer(n);
    var r = L.sourceRectAtTime(t, false);
    var p = bdXform(L, 'ADBE Position').valueAtTime(t, false);
    var s = bdXform(L, 'ADBE Scale').valueAtTime(t, false)[0] / 100;
    var a = PARAMS.layout.anchor;
    return [p[0] + (r.left - a[0]) * s, p[1] + (r.top - a[1]) * s, r.width * s, r.height * s];
  };
  return { pass: true, detail: { cube: box('CUBE'), wordmark: box('WORDMARK'), plate: box('PLATE') } };
});

lmStep('Essential Graphics: Подложка, Тема, Фон; QA left out', true, function () {
  var added = [];
  for (var i = 0; i < PARAMS.egp.length; i++) {
    var e = PARAMS.egp[i].effect;
    var matchName = PARAMS.ctrl[e].kind === 'checkbox' ? 'ADBE Checkbox Control' : 'ADBE Dropdown Control';
    added.push(bdEgpAdd(LM.comp, bkEffect(lmLayer('CTRL'), e, matchName).property(1), PARAMS.ctrl[e].label));
  }
  var names = bdEgpNames(LM.comp);
  var want = [PARAMS.ctrl.Plate.label, PARAMS.ctrl.Theme.label, PARAMS.ctrl.Background.label];
  return { pass: names.join('|') === want.join('|'), detail: { added: added, names: names } };
});

if (LM.ready) {
  app.endUndoGroup();
}

lmStep('saved: ' + PARAMS.out.aep, true, function () {
  var r = bkSaveAs(PARAMS.out.aep);
  return { pass: r.bytes > 0 && r.dirty === false, detail: r };
});

var LM_DATA = { project: '', comp: null };
try {
  LM_DATA.project = bkProjectPath();
  if (LM.comp) {
    LM_DATA.comp = { name: LM.comp.name, id: LM.comp.id, layers: LM.comp.numLayers, markers: bkMarkers(LM.comp) };
  }
} catch (e) {
  LM_DATA.error = String(e);
}
finish(LM_DATA);
