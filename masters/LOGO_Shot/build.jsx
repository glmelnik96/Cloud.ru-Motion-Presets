// Builds CR_LOGO_Shot, the logoshot with a caption (16:9 layout), in a NEW project and saves it as PARAMS.out.aep.
// Composed after spikes/lib/check.jsx, spikes/lib/ae-project.jsx and tools/masters/jsx/ae-build-lib.jsx;
// PARAMS come from masters/LOGO_Shot/resolve.mjs (numbers from the pack dump, logo from the master SVG).
// Layers, top to bottom: CTRL, RIG, CAMERA, QA_PATCH, CAPTION, LOCKUP, PL_CAPTION, PL_LOGO, BG. Top level, flat,
// placed in comp coordinates by expressions (k = min(w, h) / 1080), so a variant is a resized duplicate.
var LS = { ready: false, comp: null };

function lsStep(name, required, fn) {
  return check(name, function () {
    if (!LS.ready) {
      return { pass: false, detail: 'skipped: no fresh project' };
    }
    return fn();
  }, required);
}

function lsLayer(name) {
  return bkLayer(LS.comp, name);
}

function lsRect(L, group, hex) {
  bdGroup(L, group);
  bdRect(L, group, 'Rect');
  bdFill(L, group, hex, 'Fill');
}

function lsRectProp(name, group, item, matchName) {
  return bdGroupItem(lsLayer(name), group, item).property(matchName);
}

function lsNoErrors(list) {
  var bad = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] !== '') {
      bad.push(list[i]);
    }
  }
  return bad;
}

check('project: new, expression engine javascript-1.0', function () {
  bkNewProject();
  app.project.expressionEngine = 'javascript-1.0';
  LS.ready = true;
  return { pass: app.project.expressionEngine === 'javascript-1.0', detail: 'AE ' + app.version };
}, true);

// A new project takes the colour settings AE used last (a linearized sRGB project of S3 was inherited on
// 2026-10-03), and a MOGRT carries them into Premiere: there the linear output came out as v^(1/2.4)
// (#222222 -> #6E6E6E). Templates are display-referred: no working space, no linearization, 8 bpc.
lsStep('project colour: 8 bpc, no working space, no linearization, no linear blending', true, function () {
  var p = app.project;
  var before = { bpc: p.bitsPerChannel, space: String(p.workingSpace), linearize: p.linearizeWorkingSpace, linearBlending: p.linearBlending };
  // Setting 'None' works but raises the warning 'Profile "None" is missing...' (83 :: 0) as a modal, so it is
  // set only when needed and with dialogs suppressed (AE 26.5, 2026-10-03).
  bkQuiet(function () {
    p.linearizeWorkingSpace = false;
    p.linearBlending = false;
    if (String(p.workingSpace) !== 'None') {
      p.workingSpace = 'None';
    }
    p.bitsPerChannel = 8;
  });
  var after = { bpc: p.bitsPerChannel, space: String(p.workingSpace), linearize: p.linearizeWorkingSpace, linearBlending: p.linearBlending };
  return { pass: after.bpc === 8 && after.space === 'None' && after.linearize === false && after.linearBlending === false,
    detail: { before: before, after: after } };
});

check('font ' + PARAMS.font + ' resolves to a real file', function () {
  var list = app.fonts.getFontsByPostScriptName(PARAMS.font);
  var loc = list.length ? String(list[0].location) : '';
  return { pass: list.length > 0 && !/times\.ttf$/i.test(loc), detail: { found: list.length, file: loc, version: list.length ? String(list[0].version) : '' } };
}, false);

if (LS.ready) {
  app.beginUndoGroup('BK build ' + PARAMS.id);
}

lsStep('comp ' + PARAMS.comp.name + ': ' + PARAMS.comp.w + 'x' + PARAMS.comp.h + ', ' + PARAMS.comp.fps + ' fps, ' + PARAMS.comp.duration + ' s, Classic 3D, no motion blur', true, function () {
  var c = PARAMS.comp;
  LS.comp = app.project.items.addComp(c.name, c.w, c.h, 1, c.duration, c.fps);
  LS.comp.bgColor = [0, 0, 0];
  LS.comp.motionBlur = false;
  LS.comp.workAreaStart = 0;
  LS.comp.workAreaDuration = c.duration;
  var r = bdClassic3d(LS.comp);
  return { pass: LS.comp.frameRate === c.fps && Math.abs(LS.comp.duration - c.duration) < 1e-6 && r === 'ADBE Advanced 3d',
    detail: LS.comp.width + 'x' + LS.comp.height + ' ' + LS.comp.frameRate + ' fps ' + LS.comp.duration + ' s ' + r };
});

lsStep('layers: BG, PL_LOGO, PL_CAPTION, LOCKUP, CAPTION, QA_PATCH (geometry only)', true, function () {
  lsRect(bdShapeLayer(LS.comp, 'BG'), 'Plate', PARAMS.hex.black);
  lsRect(bdShapeLayer(LS.comp, 'PL_LOGO'), 'Plate', PARAMS.hex.white);
  lsRect(bdShapeLayer(LS.comp, 'PL_CAPTION'), 'Plate', PARAMS.hex.white);
  var L = bdShapeLayer(LS.comp, 'LOCKUP');
  var i;
  bdGroup(L, 'Cube');
  for (i = 0; i < PARAMS.lockup.cube.length; i++) {
    bdPath(L, 'Cube', PARAMS.lockup.cube[i], 'Path ' + (i + 1));
  }
  bdFill(L, 'Cube', PARAMS.hex.green, 'Fill');
  bdGroup(L, 'Wordmark');
  for (i = 0; i < PARAMS.lockup.wordmark.length; i++) {
    bdPath(L, 'Wordmark', PARAMS.lockup.wordmark[i], 'Path ' + (i + 1));
  }
  bdFill(L, 'Wordmark', PARAMS.hex.black, 'Fill');
  L.threeDLayer = true;
  bdSpan(L, LS.comp.duration, PARAMS.flip.inPoint);
  var pv = PARAMS.layout.pivot;
  bdXform(L, 'ADBE Anchor Point').setValue([pv.lx, pv.ly, pv.z]);
  var T = bdText(LS.comp, 'CAPTION', PARAMS.ctrl.Caption.items[0], { font: PARAMS.font, size: PARAMS.fontPx, fill: PARAMS.hex.black, tracking: 0, justify: 'LEFT' });
  bdAddEffect(T, 'ADBE Fill', 'Theme Fill');
  lsRect(bdShapeLayer(LS.comp, 'QA_PATCH'), 'Patch', PARAMS.hex.green);
  return { pass: true, detail: { lockupPaths: PARAMS.lockup.cube.length + PARAMS.lockup.wordmark.length, inPoint: L.inPoint, font: bdFontInfo(T) } };
});

lsStep('LOCKUP flip: X Rotation keys from the pack (first key on the frame grid)', true, function () {
  var n = bdKeys(bdXform(lsLayer('LOCKUP'), 'ADBE Rotate X'), PARAMS.flip.keys);
  return { pass: n === PARAMS.flip.keys.length, detail: bdKeyDump(bdXform(lsLayer('LOCKUP'), 'ADBE Rotate X')) };
});

lsStep('CAMERA: the default 50 mm camera made explicit, following the comp size', true, function () {
  var cam = LS.comp.layers.addCamera('CAMERA', [LS.comp.width / 2, LS.comp.height / 2]);
  bdSpan(cam, LS.comp.duration);
  var e = [];
  e.push(bdExpr(cam.property('ADBE Camera Options Group').property('ADBE Camera Zoom'), PARAMS.expr.cameraZoom));
  e.push(bdExpr(bdXform(cam, 'ADBE Position'), PARAMS.expr.cameraPos));
  e.push(bdExpr(bdXform(cam, 'ADBE Anchor Point'), PARAMS.expr.cameraPoi));
  var bad = lsNoErrors(e);
  return { pass: bad.length === 0, detail: { errors: bad, zoom: cam.property('ADBE Camera Options Group').property('ADBE Camera Zoom').value } };
});

lsStep('RIG: progress sliders with the pack curves (shy, not in Essential Graphics)', true, function () {
  var L = bdNull(LS.comp, 'RIG');
  L.shy = true;
  var out = {};
  var names = ['Open', 'Slide', 'Unroll', 'CloseW', 'CloseX'];
  for (var i = 0; i < names.length; i++) {
    bdSlider(L, names[i], 0);
    bdKeys(bkEffect(L, names[i], 'ADBE Slider Control').property(1), PARAMS.rig[names[i]]);
    out[names[i]] = bdKeyDump(bkEffect(L, names[i], 'ADBE Slider Control').property(1));
  }
  return { pass: true, detail: out };
});

lsStep('CTRL: Caption, Theme, Background (dropdowns, Cyrillic items), QA', true, function () {
  var L = bdNull(LS.comp, 'CTRL');
  var got = {};
  var ok = true;
  var names = ['Caption', 'Theme', 'Background'];
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
lsStep('expressions: plates, lockup, caption, background, QA patch', true, function () {
  var X = PARAMS.expr;
  var list = [
    ['BG size', lsRectProp('BG', 'Plate', 'Rect', 'ADBE Vector Rect Size'), X.bgSize],
    ['BG position', lsRectProp('BG', 'Plate', 'Rect', 'ADBE Vector Rect Position'), X.bgPos],
    ['BG fill', lsRectProp('BG', 'Plate', 'Fill', 'ADBE Vector Fill Color'), X.bgFill],
    ['BG opacity', bdXform(lsLayer('BG'), 'ADBE Opacity'), X.bgOpacity],
    ['PL_LOGO size', lsRectProp('PL_LOGO', 'Plate', 'Rect', 'ADBE Vector Rect Size'), X.plateLogoSize],
    ['PL_LOGO position', lsRectProp('PL_LOGO', 'Plate', 'Rect', 'ADBE Vector Rect Position'), X.plateLogoPos],
    ['PL_LOGO fill', lsRectProp('PL_LOGO', 'Plate', 'Fill', 'ADBE Vector Fill Color'), X.plateFill],
    ['PL_CAPTION size', lsRectProp('PL_CAPTION', 'Plate', 'Rect', 'ADBE Vector Rect Size'), X.plateCapSize],
    ['PL_CAPTION position', lsRectProp('PL_CAPTION', 'Plate', 'Rect', 'ADBE Vector Rect Position'), X.plateCapPos],
    ['PL_CAPTION fill', lsRectProp('PL_CAPTION', 'Plate', 'Fill', 'ADBE Vector Fill Color'), X.plateFill],
    ['LOCKUP position', bdXform(lsLayer('LOCKUP'), 'ADBE Position'), X.lockupPos],
    ['LOCKUP scale', bdXform(lsLayer('LOCKUP'), 'ADBE Scale'), X.lockupScale],
    ['LOCKUP wordmark fill', bdGroupItem(lsLayer('LOCKUP'), 'Wordmark', 'Fill').property('ADBE Vector Fill Color'), X.wordFill],
    ['CAPTION text', bkSourceText(lsLayer('CAPTION')), X.captionText],
    ['CAPTION fill', bkEffect(lsLayer('CAPTION'), 'Theme Fill', 'ADBE Fill').property('ADBE Fill-0002'), X.captionFill],
    ['CAPTION position', bdXform(lsLayer('CAPTION'), 'ADBE Position'), X.captionPos],
    ['QA_PATCH size', lsRectProp('QA_PATCH', 'Patch', 'Rect', 'ADBE Vector Rect Size'), X.qaSize],
    ['QA_PATCH position', lsRectProp('QA_PATCH', 'Patch', 'Rect', 'ADBE Vector Rect Position'), X.qaPos],
    ['QA_PATCH opacity', bdXform(lsLayer('QA_PATCH'), 'ADBE Opacity'), X.qaOpacity]
  ];
  var bad = [];
  for (var i = 0; i < list.length; i++) {
    var err = bdExpr(list[i][1], list[i][2]);
    if (err !== '' || list[i][1].expressionEnabled !== true) {
      bad.push(list[i][0] + ': ' + (err || 'disabled'));
    }
  }
  return { pass: bad.length === 0, detail: { set: list.length, errors: bad } };
});

lsStep('mattes: LOCKUP and CAPTION by alpha of their plates (plates stay visible)', true, function () {
  var a = bdMatte(lsLayer('LOCKUP'), lsLayer('PL_LOGO'), 'ALPHA');
  var b = bdMatte(lsLayer('CAPTION'), lsLayer('PL_CAPTION'), 'ALPHA');
  // setTrackMatte hides the matte layer, as the UI does (AE 26.5, seen 2026-10-03); the plates are
  // mattes and visible at the same time, as in the pack, so they are switched back on.
  lsLayer('PL_LOGO').enabled = true;
  lsLayer('PL_CAPTION').enabled = true;
  var vis = lsLayer('PL_LOGO').enabled && lsLayer('PL_CAPTION').enabled;
  return { pass: a.matte === 'PL_LOGO' && b.matte === 'PL_CAPTION' && vis, detail: [a, b, 'plates visible: ' + vis] };
});

lsStep('markers: protected regions in / out', true, function () {
  var got = bdMarkers(LS.comp, PARAMS.markers);
  var ok = got.length === PARAMS.markers.length;
  for (var j = 0; ok && j < got.length; j++) {
    ok = got[j].protectedRegion && got[j].comment === PARAMS.markers[j].comment &&
      Math.abs(got[j].time - PARAMS.markers[j].time) < 1e-3 && Math.abs(got[j].duration - PARAMS.markers[j].duration) < 1e-3;
  }
  return { pass: ok, detail: got };
});

lsStep('layer order and switches: flat, no motion blur, startTime 0', true, function () {
  var want = ['CTRL', 'RIG', 'CAMERA', 'QA_PATCH', 'CAPTION', 'LOCKUP', 'PL_CAPTION', 'PL_LOGO', 'BG'];
  var names = [];
  var bad = [];
  for (var i = 1; i <= LS.comp.numLayers; i++) {
    var L = LS.comp.layer(i);
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

lsStep('expressions: every one evaluates without errors at the sweep times', true, function () {
  var r = bdExprSweep(LS.comp, PARAMS.sweepTimes);
  return { pass: r.errors.length === 0, detail: r };
});

// Rest layout against the pack (k = 1): plates, lockup and caption where the dump has them.
lsStep('rest layout at ' + PARAMS.rest + ' s: plate sizes and positions', true, function () {
  var t = PARAMS.rest;
  var pl = lsLayer('PL_LOGO').sourceRectAtTime(t, false);
  var pc = lsLayer('PL_CAPTION').sourceRectAtTime(t, false);
  var ink = lsLayer('CAPTION').sourceRectAtTime(0, false);
  var capPos = bdXform(lsLayer('CAPTION'), 'ADBE Position').valueAtTime(t, false);
  var lockPos = bdXform(lsLayer('LOCKUP'), 'ADBE Position').valueAtTime(t, false);
  var rot = bdXform(lsLayer('LOCKUP'), 'ADBE Rotate X').valueAtTime(t, false);
  var d = {
    plateLogo: [pl.left, pl.top, pl.width, pl.height],
    plateCaption: [pc.left, pc.top, pc.width, pc.height],
    captionInk: [ink.left, ink.top, ink.width, ink.height],
    captionPos: capPos,
    lockupPos: lockPos,
    rotX: rot
  };
  var ok = Math.abs(pl.width - PARAMS.layout.plate.w) < 0.01 && Math.abs(pl.height - PARAMS.layout.plate.h) < 0.01 &&
    Math.abs(pc.height - PARAMS.layout.plate.h) < 0.01 && Math.abs(pc.left - (pl.left + pl.width + PARAMS.layout.gap)) < 0.01 &&
    Math.abs(rot) < 1e-6;
  return { pass: ok, detail: d };
});

// canAdd first, add only when it says yes, dialogs suppressed (S1). Names read back from index 1,
// newest first (AE 26.5).
lsStep('Essential Graphics: Caption, Theme, Background with Russian names, QA left out', true, function () {
  var C = lsLayer('CTRL');
  var added = [];
  for (var i = 0; i < PARAMS.egp.length; i++) {
    var key = PARAMS.egp[i];
    var prop = bkEffect(C, key, 'ADBE Dropdown Control').property(1);
    var can = null;
    var ok = null;
    app.beginSuppressDialogs();
    try {
      can = prop.canAddToMotionGraphicsTemplate(LS.comp);
      if (can === true) {
        ok = prop.addToMotionGraphicsTemplateAs(LS.comp, PARAMS.ctrl[key].label);
      }
    } finally {
      app.endSuppressDialogs(false);
    }
    added.push(key + ': canAdd=' + can + ', add=' + ok);
  }
  var n = LS.comp.motionGraphicsTemplateControllerCount;
  var names = [];
  for (var j = 1; j <= n; j++) {
    names.push(LS.comp.getMotionGraphicsTemplateControllerName(j));
  }
  var want = [];
  for (var w = PARAMS.egp.length - 1; w >= 0; w--) {
    want.push(PARAMS.ctrl[PARAMS.egp[w]].label);
  }
  return { pass: names.join('|') === want.join('|'), detail: { added: added, names: names } };
});

if (LS.ready) {
  app.endUndoGroup();
}

lsStep('saved: ' + PARAMS.out.aep, true, function () {
  var r = bkSaveAs(PARAMS.out.aep);
  return { pass: r.bytes > 0 && r.dirty === false, detail: r };
});

var LS_DATA = { project: '', comp: null };
try {
  LS_DATA.project = bkProjectPath();
  if (LS.comp) {
    LS_DATA.comp = { name: LS.comp.name, id: LS.comp.id, layers: LS.comp.numLayers, markers: bkMarkers(LS.comp) };
  }
} catch (e) {
  LS_DATA.error = String(e);
}
finish(LS_DATA);
