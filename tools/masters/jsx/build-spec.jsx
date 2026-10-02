// Builds a master from a declarative spec (PARAMS.spec, resolved in Node) in a NEW project and saves it as
// PARAMS.out.aep. Composed after spikes/lib/check.jsx, spikes/lib/ae-project.jsx, ae-build-lib.jsx.
// spec: comp { name, w, h, fps, duration }, layers (creation order, bottom first), keys, expressions, mattes,
// markers, egp, order (expected top-to-bottom names). Property paths (sp.path):
//   ['transform', matchName] | ['group', group, item, matchName] | ['text'] | ['animator', name, matchName]
//   | ['selector', animator, matchName] | ['effect', name, effectMatchName, paramIndexOrMatchName]
var SB = { ready: false, comp: null };

function sbStep(name, required, fn) {
  return check(name, function () {
    if (!SB.ready) {
      return { pass: false, detail: 'skipped: no fresh project' };
    }
    return fn();
  }, required);
}

function sbLayer(name) {
  return bkLayer(SB.comp, name);
}

function sbProp(layerName, path) {
  var L = sbLayer(layerName);
  var kind = path[0];
  if (kind === 'transform') {
    return bdXform(L, path[1]);
  }
  if (kind === 'group') {
    return bdGroupItem(L, path[1], path[2]).property(path[3]);
  }
  if (kind === 'text') {
    return bkSourceText(L);
  }
  if (kind === 'animator') {
    return bdAnimator(L, path[1]).property('ADBE Text Animator Properties').property(path[2]);
  }
  if (kind === 'selector') {
    return bdAnimator(L, path[1]).property('ADBE Text Selectors').property(1).property(path[2]);
  }
  if (kind === 'effect') {
    return bkEffect(L, path[1], path[2]).property(path[3]);
  }
  throw new Error('BK_PATH: ' + path.join('/'));
}

function sbMakeLayer(spec) {
  var L = null;
  var i;
  if (spec.type === 'null') {
    L = bdNull(SB.comp, spec.name);
  } else if (spec.type === 'shape') {
    L = bdShapeLayer(SB.comp, spec.name);
    for (var g = 0; g < spec.groups.length; g++) {
      var G = spec.groups[g];
      bdGroup(L, G.name);
      if (G.rect) {
        bdRect(L, G.name, 'Rect');
      }
      var paths = G.paths || [];
      for (i = 0; i < paths.length; i++) {
        bdPath(L, G.name, paths[i], 'Path ' + (i + 1));
      }
      bdFill(L, G.name, G.fill, 'Fill');
      if (G.position) {
        L.property('ADBE Root Vectors Group').property(G.name).property('ADBE Vector Transform Group')
          .property('ADBE Vector Position').setValue(G.position);
      }
    }
  } else if (spec.type === 'text') {
    var t = spec.text;
    L = bdText(SB.comp, spec.name, t.value === '' ? ' ' : t.value, t);
    var st = bkSourceText(L);
    var doc = st.value;
    if (t.value === '') {
      doc.text = '';
    }
    if (t.allCaps) {
      // allCaps is read-only; caps are set through fontCapsOption (AE 24.0+)
      doc.fontCapsOption = FontCapsOption.FONT_ALL_CAPS;
    }
    st.setValue(doc);
    var anims = spec.animators || [];
    for (i = 0; i < anims.length; i++) {
      bdAddAnimator(L, anims[i].name);
      bdAnimatorPosition(L, anims[i].name);
      bdRangeSelector(L, anims[i].name, anims[i].basedOn);
    }
  } else {
    throw new Error('BK_LAYER_TYPE: ' + spec.type);
  }
  if (spec.anchor) {
    bdXform(L, 'ADBE Anchor Point').setValue(spec.anchor);
  }
  var fx = spec.effects || [];
  for (i = 0; i < fx.length; i++) {
    if (fx[i].kind === 'slider') {
      bdSlider(L, fx[i].name, fx[i].value || 0);
    } else if (fx[i].kind === 'checkbox') {
      bdCheckbox(L, fx[i].name, fx[i].value);
    } else if (fx[i].kind === 'dropdown') {
      var r = bdDropdown(L, fx[i].name, fx[i].items, fx[i].value);
      if (r.items === null || r.items.join('|') !== fx[i].items.join('|')) {
        throw new Error('BK_DROPDOWN_ITEMS: ' + fx[i].name);
      }
    } else {
      bdAddEffect(L, fx[i].matchName, fx[i].name);
    }
  }
  if (spec.shy) {
    L.shy = true;
  }
  return L;
}

check('project: new, expression engine javascript-1.0', function () {
  bkNewProject();
  app.project.expressionEngine = 'javascript-1.0';
  SB.ready = true;
  return { pass: app.project.expressionEngine === 'javascript-1.0', detail: 'AE ' + app.version };
}, true);

sbStep('project colour: 8 bpc, no working space, no linearization, no linear blending', true, function () {
  return bdProjectColour();
});

check('fonts resolve to real files: ' + PARAMS.spec.fonts.join(', '), function () {
  var out = [];
  var ok = true;
  for (var i = 0; i < PARAMS.spec.fonts.length; i++) {
    var list = app.fonts.getFontsByPostScriptName(PARAMS.spec.fonts[i]);
    var loc = list.length ? String(list[0].location) : '';
    if (!list.length || /times\.ttf$/i.test(loc)) {
      ok = false;
    }
    out.push(PARAMS.spec.fonts[i] + ' ' + (list.length ? String(list[0].version) : 'missing'));
  }
  return { pass: ok, detail: out };
}, false);

if (SB.ready) {
  app.beginUndoGroup('BK build ' + PARAMS.id);
}

sbStep('comp ' + PARAMS.spec.comp.name, true, function () {
  var c = PARAMS.spec.comp;
  SB.comp = app.project.items.addComp(c.name, c.w, c.h, 1, c.duration, c.fps);
  SB.comp.bgColor = [0, 0, 0];
  SB.comp.motionBlur = false;
  SB.comp.workAreaStart = 0;
  SB.comp.workAreaDuration = c.duration;
  bdClassic3d(SB.comp);
  return { pass: SB.comp.frameRate === c.fps && Math.abs(SB.comp.duration - c.duration) < 1e-6, detail: SB.comp.width + 'x' + SB.comp.height + ' ' + c.duration + ' s' };
});

sbStep('layers (' + PARAMS.spec.layers.length + ')', true, function () {
  var made = [];
  for (var i = 0; i < PARAMS.spec.layers.length; i++) {
    made.push(sbMakeLayer(PARAMS.spec.layers[i]).name);
  }
  return { pass: made.length === PARAMS.spec.layers.length, detail: made };
});

sbStep('keys (' + PARAMS.spec.keys.length + ' properties) from the pack curves', true, function () {
  var bad = [];
  for (var i = 0; i < PARAMS.spec.keys.length; i++) {
    var k = PARAMS.spec.keys[i];
    var n = bdKeys(sbProp(k.layer, k.path), k.keys);
    if (n !== k.keys.length) {
      bad.push(k.layer + ' ' + k.path.join('/') + ': ' + n);
    }
  }
  return { pass: bad.length === 0, detail: bad.length ? bad : PARAMS.spec.keys.length + ' properties keyed' };
});

// Expressions go in last: one that names a missing layer is disabled by AE on the spot.
sbStep('expressions (' + PARAMS.spec.expressions.length + ')', true, function () {
  var bad = [];
  for (var i = 0; i < PARAMS.spec.expressions.length; i++) {
    var e = PARAMS.spec.expressions[i];
    var p = sbProp(e.layer, e.path);
    var err = bdExpr(p, e.src);
    if (err !== '' || p.expressionEnabled !== true) {
      bad.push(e.layer + ' ' + e.path.join('/') + ': ' + (err || 'disabled'));
    }
  }
  return { pass: bad.length === 0, detail: { set: PARAMS.spec.expressions.length, errors: bad } };
});

sbStep('mattes (' + PARAMS.spec.mattes.length + ')', true, function () {
  var r = [];
  var ok = true;
  for (var i = 0; i < PARAMS.spec.mattes.length; i++) {
    var m = PARAMS.spec.mattes[i];
    var res = bdMatte(sbLayer(m.layer), sbLayer(m.matte), m.type);
    ok = ok && res.matte === m.matte;
    r.push(res);
  }
  // setTrackMatte hides the matte layer; plates are mattes and visible at the same time
  for (var j = 0; j < PARAMS.spec.visible.length; j++) {
    sbLayer(PARAMS.spec.visible[j]).enabled = true;
  }
  return { pass: ok, detail: r };
});

sbStep('markers: protected regions in / out', true, function () {
  var got = bdMarkers(SB.comp, PARAMS.spec.markers);
  var ok = got.length === PARAMS.spec.markers.length;
  for (var j = 0; ok && j < got.length; j++) {
    ok = got[j].protectedRegion && got[j].comment === PARAMS.spec.markers[j].comment &&
      Math.abs(got[j].time - PARAMS.spec.markers[j].time) < 1e-3 && Math.abs(got[j].duration - PARAMS.spec.markers[j].duration) < 1e-3;
  }
  return { pass: ok, detail: got };
});

sbStep('layer order and switches: flat, no motion blur, startTime 0', true, function () {
  var names = [];
  var bad = [];
  for (var i = 1; i <= SB.comp.numLayers; i++) {
    var L = SB.comp.layer(i);
    names.push(L.name);
    if (L.motionBlur) {
      bad.push(L.name + ': motion blur');
    }
    if (L.startTime !== 0) {
      bad.push(L.name + ': startTime ' + L.startTime);
    }
  }
  return { pass: names.join(',') === PARAMS.spec.order.join(',') && bad.length === 0, detail: { order: names, problems: bad } };
});

sbStep('expressions: every one evaluates without errors at the sweep times', true, function () {
  var r = bdExprSweep(SB.comp, PARAMS.sweepTimes);
  return { pass: r.errors.length === 0, detail: r };
});

// Measurements Node asked for: per case, set the texts and controls, read source rects and positions,
// then put the defaults back (the saved master keeps its defaults).
sbStep('measurements (' + (PARAMS.spec.measure || []).length + ' cases)', true, function () {
  var out = [];
  var cases = PARAMS.spec.measure || [];
  var setText = function (n, s) {
    var st = bkSourceText(sbLayer(n));
    var doc = st.valueAtTime(0, true);
    doc.text = s;
    st.setValue(doc);
  };
  for (var c = 0; c < cases.length; c++) {
    var cs = cases[c];
    var key;
    for (key in cs.text) {
      if (cs.text.hasOwnProperty(key)) {
        setText(key, cs.text[key]);
      }
    }
    for (key in cs.ctrl) {
      if (cs.ctrl.hasOwnProperty(key)) {
        sbLayer('CTRL').property('ADBE Effect Parade').property(key).property(1).setValue(cs.ctrl[key]);
      }
    }
    var row = { name: cs.name, rects: {}, positions: {} };
    for (var i = 0; i < cs.layers.length; i++) {
      var L = sbLayer(cs.layers[i]);
      var r = L.sourceRectAtTime(cs.t, false);
      row.rects[cs.layers[i]] = [r.left, r.top, r.width, r.height];
      row.positions[cs.layers[i]] = bdXform(L, 'ADBE Position').valueAtTime(cs.t, false);
    }
    out.push(row);
  }
  var d = PARAMS.spec.defaults;
  for (var t in d.text) {
    if (d.text.hasOwnProperty(t)) {
      setText(t, d.text[t]);
    }
  }
  for (var e in d.ctrl) {
    if (d.ctrl.hasOwnProperty(e)) {
      sbLayer('CTRL').property('ADBE Effect Parade').property(e).property(1).setValue(d.ctrl[e]);
    }
  }
  return { pass: true, detail: out };
});

sbStep('Essential Graphics (' + PARAMS.spec.egp.length + ' controllers; QA left out)', true, function () {
  var added = [];
  for (var i = 0; i < PARAMS.spec.egp.length; i++) {
    var e = PARAMS.spec.egp[i];
    var prop = e.text ? bkSourceText(sbLayer(e.text)) : bkEffect(sbLayer('CTRL'), e.effect, e.matchName).property(1);
    added.push(bdEgpAdd(SB.comp, prop, e.label));
  }
  var names = bdEgpNames(SB.comp);
  return { pass: names.join('|') === PARAMS.spec.egpNames.join('|'), detail: { added: added, names: names } };
});

if (SB.ready) {
  app.endUndoGroup();
}

sbStep('saved: ' + PARAMS.out.aep, true, function () {
  var r = bkSaveAs(PARAMS.out.aep);
  return { pass: r.bytes > 0 && r.dirty === false, detail: r };
});

var SB_DATA = { project: '', comp: null };
try {
  SB_DATA.project = bkProjectPath();
  if (SB.comp) {
    SB_DATA.comp = { name: SB.comp.name, id: SB.comp.id, layers: SB.comp.numLayers, markers: bkMarkers(SB.comp) };
  }
} catch (e0) {
  SB_DATA.error = String(e0);
}
finish(SB_DATA);
