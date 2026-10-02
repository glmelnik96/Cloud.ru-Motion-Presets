// Builds CR_TTL_LowerThird, the speaker title in the style of the Titles pack, in a NEW project and saves it
// as PARAMS.out.aep. Composed after spikes/lib/check.jsx, spikes/lib/ae-project.jsx and
// tools/masters/jsx/ae-build-lib.jsx; PARAMS come from masters/TTL_LowerThird/resolve.mjs.
// Layers, top to bottom: CTRL, RIG, QA_PATCH, EDGE_NAME, EDGE_ROLE, TXT_NAME, TXT_ROLE1, TXT_ROLE2, PL_NAME,
// PL_ROLE. Flat, top level, placed in comp coordinates by expressions (k = min(w, h) / 1080).
var LT = { ready: false, comp: null };

function ltStep(name, required, fn) {
  return check(name, function () {
    if (!LT.ready) {
      return { pass: false, detail: 'skipped: no fresh project' };
    }
    return fn();
  }, required);
}

function ltLayer(name) {
  return bkLayer(LT.comp, name);
}

function ltRect(L, group, hex) {
  bdGroup(L, group);
  bdRect(L, group, 'Rect');
  bdFill(L, group, hex, 'Fill');
}

function ltRectProp(name, group, item, matchName) {
  return bdGroupItem(ltLayer(name), group, item).property(matchName);
}

check('project: new, expression engine javascript-1.0', function () {
  bkNewProject();
  app.project.expressionEngine = 'javascript-1.0';
  LT.ready = true;
  return { pass: app.project.expressionEngine === 'javascript-1.0', detail: 'AE ' + app.version };
}, true);

ltStep('project colour: 8 bpc, no working space, no linearization, no linear blending', true, function () {
  return bdProjectColour();
});

check('font ' + PARAMS.layout.font + ' resolves to a real file', function () {
  var list = app.fonts.getFontsByPostScriptName(PARAMS.layout.font);
  var loc = list.length ? String(list[0].location) : '';
  return { pass: list.length > 0 && !/times\.ttf$/i.test(loc), detail: { found: list.length, file: loc, version: list.length ? String(list[0].version) : '' } };
}, false);

if (LT.ready) {
  app.beginUndoGroup('BK build ' + PARAMS.id);
}

ltStep('comp ' + PARAMS.comp.name + ': ' + PARAMS.comp.w + 'x' + PARAMS.comp.h + ', ' + PARAMS.comp.fps + ' fps, ' + PARAMS.comp.duration + ' s, no motion blur', true, function () {
  var c = PARAMS.comp;
  LT.comp = app.project.items.addComp(c.name, c.w, c.h, 1, c.duration, c.fps);
  LT.comp.bgColor = [0, 0, 0];
  LT.comp.motionBlur = false;
  LT.comp.workAreaStart = 0;
  LT.comp.workAreaDuration = c.duration;
  var r = bdClassic3d(LT.comp);
  return { pass: LT.comp.frameRate === c.fps && Math.abs(LT.comp.duration - c.duration) < 1e-6, detail: LT.comp.width + 'x' + LT.comp.height + ' ' + r };
});

ltStep('layers: plates, texts with rise animators, edges, QA patch (geometry only)', true, function () {
  ltRect(bdShapeLayer(LT.comp, 'PL_ROLE'), 'Plate', PARAMS.hex.black);
  ltRect(bdShapeLayer(LT.comp, 'PL_NAME'), 'Plate', PARAMS.hex.black);
  var names = ['TXT_ROLE2', 'TXT_ROLE1', 'TXT_NAME'];
  var fonts = [];
  for (var i = 0; i < names.length; i++) {
    var spec = PARAMS.text[names[i]];
    var T = bdText(LT.comp, names[i], spec.value === '' ? ' ' : spec.value, { font: PARAMS.layout.font, size: spec.size, fill: PARAMS.hex.white, tracking: 0, justify: 'LEFT' });
    if (spec.value === '') {
      var st = bkSourceText(T);
      var doc = st.value;
      doc.text = '';
      st.setValue(doc);
    }
    bdAddAnimator(T, 'Rise');
    bdAnimatorPosition(T, 'Rise');
    bdRangeSelector(T, 'Rise', spec.basedOn);
    fonts.push(names[i] + ': ' + bdFontInfo(T).font + ' ' + bdFontInfo(T).size);
  }
  var E = bdShapeLayer(LT.comp, 'EDGE_ROLE');
  ltRect(E, 'In', PARAMS.hex.white);
  ltRect(E, 'Out', PARAMS.hex.white);
  E = bdShapeLayer(LT.comp, 'EDGE_NAME');
  ltRect(E, 'In', PARAMS.hex.white);
  ltRect(E, 'Out', PARAMS.hex.white);
  ltRect(bdShapeLayer(LT.comp, 'QA_PATCH'), 'Patch', PARAMS.hex.green);
  return { pass: true, detail: fonts };
});

ltStep('TXT_NAME rise: Start keys of the pack (words, linear 0.24-0.76 s)', true, function () {
  var start = bdAnimator(ltLayer('TXT_NAME'), 'Rise').property('ADBE Text Selectors').property(1).property('ADBE Text Percent Start');
  var n = bdKeys(start, PARAMS.nameStart);
  return { pass: n === PARAMS.nameStart.length, detail: n };
});

ltStep('RIG: plate and role sliders with the pack curves (shy, not in Essential Graphics)', true, function () {
  var L = bdNull(LT.comp, 'RIG');
  L.shy = true;
  var out = {};
  var names = ['NameIn', 'RoleIn', 'NameOut', 'RoleOut', 'RoleStart'];
  for (var i = 0; i < names.length; i++) {
    bdSlider(L, names[i], 0);
    bdKeys(bkEffect(L, names[i], 'ADBE Slider Control').property(1), PARAMS.rig[names[i]]);
    out[names[i]] = bdKeyDump(bkEffect(L, names[i], 'ADBE Slider Control').property(1)).length;
  }
  return { pass: true, detail: out };
});

ltStep('CTRL: Side (dropdown, Cyrillic items), QA', true, function () {
  var L = bdNull(LT.comp, 'CTRL');
  var r = bdDropdown(L, 'Side', PARAMS.ctrl.Side.items, PARAMS.ctrl.Side.value);
  bdCheckbox(L, 'QA', false);
  return { pass: r.items !== null && r.items.join('|') === PARAMS.ctrl.Side.items.join('|'), detail: r.items };
});

// Expressions go in last: one that names a missing layer is disabled by AE on the spot.
ltStep('expressions: plates, edges, text positions, rise offsets and role windows, QA patch', true, function () {
  var X = PARAMS.expr;
  var list = [
    ['PL_NAME size', ltRectProp('PL_NAME', 'Plate', 'Rect', 'ADBE Vector Rect Size'), X.namePlate.size],
    ['PL_NAME position', ltRectProp('PL_NAME', 'Plate', 'Rect', 'ADBE Vector Rect Position'), X.namePlate.pos],
    ['PL_ROLE size', ltRectProp('PL_ROLE', 'Plate', 'Rect', 'ADBE Vector Rect Size'), X.rolePlate.size],
    ['PL_ROLE position', ltRectProp('PL_ROLE', 'Plate', 'Rect', 'ADBE Vector Rect Position'), X.rolePlate.pos],
    ['EDGE_NAME in size', ltRectProp('EDGE_NAME', 'In', 'Rect', 'ADBE Vector Rect Size'), X.nameEdgeIn.size],
    ['EDGE_NAME in position', ltRectProp('EDGE_NAME', 'In', 'Rect', 'ADBE Vector Rect Position'), X.nameEdgeIn.pos],
    ['EDGE_NAME out size', ltRectProp('EDGE_NAME', 'Out', 'Rect', 'ADBE Vector Rect Size'), X.nameEdgeOut.size],
    ['EDGE_NAME out position', ltRectProp('EDGE_NAME', 'Out', 'Rect', 'ADBE Vector Rect Position'), X.nameEdgeOut.pos],
    ['EDGE_ROLE in size', ltRectProp('EDGE_ROLE', 'In', 'Rect', 'ADBE Vector Rect Size'), X.roleEdgeIn.size],
    ['EDGE_ROLE in position', ltRectProp('EDGE_ROLE', 'In', 'Rect', 'ADBE Vector Rect Position'), X.roleEdgeIn.pos],
    ['EDGE_ROLE out size', ltRectProp('EDGE_ROLE', 'Out', 'Rect', 'ADBE Vector Rect Size'), X.roleEdgeOut.size],
    ['EDGE_ROLE out position', ltRectProp('EDGE_ROLE', 'Out', 'Rect', 'ADBE Vector Rect Position'), X.roleEdgeOut.pos],
    ['TXT_NAME position', bdXform(ltLayer('TXT_NAME'), 'ADBE Position'), X.namePos],
    ['TXT_ROLE1 position', bdXform(ltLayer('TXT_ROLE1'), 'ADBE Position'), X.role1Pos],
    ['TXT_ROLE2 position', bdXform(ltLayer('TXT_ROLE2'), 'ADBE Position'), X.role2Pos],
    ['TXT_NAME rise', bdAnimator(ltLayer('TXT_NAME'), 'Rise').property('ADBE Text Animator Properties').property('ADBE Text Position 3D'), X.nameRise],
    ['TXT_ROLE1 rise', bdAnimator(ltLayer('TXT_ROLE1'), 'Rise').property('ADBE Text Animator Properties').property('ADBE Text Position 3D'), X.roleRise],
    ['TXT_ROLE2 rise', bdAnimator(ltLayer('TXT_ROLE2'), 'Rise').property('ADBE Text Animator Properties').property('ADBE Text Position 3D'), X.roleRise],
    ['TXT_ROLE1 start', bdAnimator(ltLayer('TXT_ROLE1'), 'Rise').property('ADBE Text Selectors').property(1).property('ADBE Text Percent Start'), X.role1Start],
    ['TXT_ROLE2 start', bdAnimator(ltLayer('TXT_ROLE2'), 'Rise').property('ADBE Text Selectors').property(1).property('ADBE Text Percent Start'), X.role2Start],
    ['QA_PATCH size', ltRectProp('QA_PATCH', 'Patch', 'Rect', 'ADBE Vector Rect Size'), X.qaSize],
    ['QA_PATCH position', ltRectProp('QA_PATCH', 'Patch', 'Rect', 'ADBE Vector Rect Position'), X.qaPos],
    ['QA_PATCH opacity', bdXform(ltLayer('QA_PATCH'), 'ADBE Opacity'), X.qaOpacity]
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

ltStep('mattes: texts by alpha of their plates (plates stay visible)', true, function () {
  var r = [];
  r.push(bdMatte(ltLayer('TXT_NAME'), ltLayer('PL_NAME'), 'ALPHA'));
  r.push(bdMatte(ltLayer('TXT_ROLE1'), ltLayer('PL_ROLE'), 'ALPHA'));
  r.push(bdMatte(ltLayer('TXT_ROLE2'), ltLayer('PL_ROLE'), 'ALPHA'));
  ltLayer('PL_NAME').enabled = true;
  ltLayer('PL_ROLE').enabled = true;
  var ok = r[0].matte === 'PL_NAME' && r[1].matte === 'PL_ROLE' && r[2].matte === 'PL_ROLE' && ltLayer('PL_NAME').enabled && ltLayer('PL_ROLE').enabled;
  return { pass: ok, detail: r };
});

ltStep('markers: protected regions in / out', true, function () {
  var got = bdMarkers(LT.comp, PARAMS.markers);
  var ok = got.length === PARAMS.markers.length;
  for (var j = 0; ok && j < got.length; j++) {
    ok = got[j].protectedRegion && got[j].comment === PARAMS.markers[j].comment &&
      Math.abs(got[j].time - PARAMS.markers[j].time) < 1e-3 && Math.abs(got[j].duration - PARAMS.markers[j].duration) < 1e-3;
  }
  return { pass: ok, detail: got };
});

ltStep('layer order and switches: flat, no motion blur, startTime 0', true, function () {
  var want = ['CTRL', 'RIG', 'QA_PATCH', 'EDGE_NAME', 'EDGE_ROLE', 'TXT_NAME', 'TXT_ROLE1', 'TXT_ROLE2', 'PL_NAME', 'PL_ROLE'];
  var names = [];
  var bad = [];
  for (var i = 1; i <= LT.comp.numLayers; i++) {
    var L = LT.comp.layer(i);
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

ltStep('expressions: every one evaluates without errors at the sweep times', true, function () {
  var r = bdExprSweep(LT.comp, PARAMS.sweepTimes);
  return { pass: r.errors.length === 0, detail: r };
});

ltStep('rest layout at ' + PARAMS.rest + ' s with the pack texts (measured, then set back)', true, function () {
  var t = PARAMS.rest;
  var set = function (n, s) {
    var st = bkSourceText(ltLayer(n));
    var doc = st.value;
    doc.text = s;
    st.setValue(doc);
  };
  set('TXT_NAME', PARAMS.check.name);
  set('TXT_ROLE1', PARAMS.check.role1);
  set('TXT_ROLE2', PARAMS.check.role2);
  var rect = function (n) {
    var r = ltLayer(n).sourceRectAtTime(t, false);
    return [r.left, r.top, r.width, r.height];
  };
  var d = {
    plateName: rect('PL_NAME'), plateRole: rect('PL_ROLE'),
    inkName: rect('TXT_NAME'), inkRole1: rect('TXT_ROLE1'), inkRole2: rect('TXT_ROLE2'),
    posName: bdXform(ltLayer('TXT_NAME'), 'ADBE Position').valueAtTime(t, false),
    posRole1: bdXform(ltLayer('TXT_ROLE1'), 'ADBE Position').valueAtTime(t, false),
    posRole2: bdXform(ltLayer('TXT_ROLE2'), 'ADBE Position').valueAtTime(t, false)
  };
  set('TXT_NAME', PARAMS.text.TXT_NAME.value);
  set('TXT_ROLE1', PARAMS.text.TXT_ROLE1.value);
  set('TXT_ROLE2', PARAMS.text.TXT_ROLE2.value);
  return { pass: d.plateName[2] > 0 && d.plateRole[2] > 0, detail: d };
});

ltStep('Essential Graphics: Имя, Должность, 2-я строка, Сторона; QA left out', true, function () {
  var added = [];
  for (var i = 0; i < PARAMS.egp.length; i++) {
    var e = PARAMS.egp[i];
    if (e.effect) {
      added.push(bdEgpAdd(LT.comp, bkEffect(ltLayer('CTRL'), e.effect, 'ADBE Dropdown Control').property(1), PARAMS.ctrl[e.effect].label));
    } else {
      added.push(bdEgpAdd(LT.comp, bkSourceText(ltLayer(e.text)), PARAMS.text[e.text].label));
    }
  }
  var names = bdEgpNames(LT.comp);
  var want = [PARAMS.text.TXT_NAME.label, PARAMS.text.TXT_ROLE1.label, PARAMS.text.TXT_ROLE2.label, PARAMS.ctrl.Side.label];
  return { pass: names.join('|') === want.join('|'), detail: { added: added, names: names } };
});

if (LT.ready) {
  app.endUndoGroup();
}

ltStep('saved: ' + PARAMS.out.aep, true, function () {
  var r = bkSaveAs(PARAMS.out.aep);
  return { pass: r.bytes > 0 && r.dirty === false, detail: r };
});

var LT_DATA = { project: '', comp: null };
try {
  LT_DATA.project = bkProjectPath();
  if (LT.comp) {
    LT_DATA.comp = { name: LT.comp.name, id: LT.comp.id, layers: LT.comp.numLayers, markers: bkMarkers(LT.comp) };
  }
} catch (e) {
  LT_DATA.error = String(e);
}
finish(LT_DATA);
