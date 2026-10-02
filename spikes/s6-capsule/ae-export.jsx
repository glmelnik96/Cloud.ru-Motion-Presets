// S6, After Effects stage (ES3, after spikes/lib/check.jsx). One export per call; Node waits for each
// .mogrt before the next call (S2 discipline: strictly one at a time, until the size settles).
//   asis    - open the S6 copy of CRT_fixture_egp.aep, export CRT_LowerThird_v1 unchanged
//   changed - QA_PATCH recoloured through a Fill effect, project saved, exported under the same template name
//   dup     - the (changed) master comp duplicated as PARAMS.dupName and exported under that name
// PARAMS: { mode, workDir, aep, comp, outDir, fonts, hex, rgb, dupName }
// Docs: https://ae-scripting.docsforadobe.dev/general/application/ (open, beginSuppressDialogs)
//       https://ae-scripting.docsforadobe.dev/general/project/ (dirty 17.5+, save(file), close)
//       https://ae-scripting.docsforadobe.dev/item/compitem/ (duplicate, openInEssentialGraphics,
//       motionGraphicsTemplateName, motionGraphicsTemplateControllerCount, exportAsMotionGraphicsTemplate)
var S6 = { mode: PARAMS.mode, templateName: null };
var s6Comp = null;

function s6Norm(p) {
  return String(p).replace(/\\/g, '/').toLowerCase();
}

function s6OpenPath() {
  var f = app.project ? app.project.file : null;
  return f ? String(f.fsName) : '';
}

function s6IsCopyOpen() {
  return s6Norm(s6OpenPath()) === s6Norm(new File(PARAMS.aep).fsName);
}

function s6InWork(p) {
  var root = s6Norm(PARAMS.workDir) + '/';
  return s6Norm(p).substr(0, root.length) === root;
}

// A changed project outside the work folder is the user's work: refuse instead of letting AE ask
// (a modal blocks the bridge, ae-quirks #25). A changed copy of ours is closed without saving.
function s6Open() {
  var p = null;
  if (s6IsCopyOpen()) {
    return 'already open';
  }
  if (app.project && app.project.dirty === true) {
    if (!s6InWork(s6OpenPath())) {
      throw new Error('BK_DIRTY_USER_PROJECT: save or close the open project first (' + (s6OpenPath() || 'untitled') + ')');
    }
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  }
  app.beginSuppressDialogs();
  try {
    p = app.open(new File(PARAMS.aep));
  } finally {
    app.endSuppressDialogs(false);
  }
  if (!p) {
    throw new Error('BK_OPEN_FAILED: ' + PARAMS.aep);
  }
  return 'opened';
}

// Exactly one comp of that name: acting on the first of two same-named items is how templates go wrong.
function s6CompNamed(name) {
  var hits = [];
  var i, it;
  for (i = 1; i <= app.project.numItems; i++) {
    it = app.project.item(i);
    if (it instanceof CompItem && it.name === name) {
      hits.push(it);
    }
  }
  if (hits.length !== 1) {
    throw new Error('BK_COMP: ' + name + ' x' + hits.length);
  }
  return hits[0];
}

function s6LayerNamed(comp, name) {
  var hits = [];
  var i;
  for (i = 1; i <= comp.numLayers; i++) {
    if (comp.layer(i).name === name) {
      hits.push(comp.layer(i));
    }
  }
  if (hits.length !== 1) {
    throw new Error('BK_LAYER: ' + name + ' x' + hits.length + ' in ' + comp.name);
  }
  return hits[0];
}

// exportAsMotionGraphicsTemplate asks to save a changed project, so the copy is saved first; since 24.x
// it may return false before the file exists, so Node judges by the file, not by this value.
function s6Export(comp) {
  var rv = null;
  var name = comp.name;
  comp.openInEssentialGraphics();
  app.beginSuppressDialogs();
  try {
    if (app.project.dirty === true) {
      // A plain Save: the open project is already PARAMS.aep (s6Open). Save As (save(file)) left the
      // comp reference invalid in AE 26.5 ("Object is invalid", seen live 2026-10-02).
      app.project.save();
    }
    comp = s6CompNamed(name);
    // Read before exporting: after exportAsMotionGraphicsTemplate the comp reference is invalid in
    // AE 26.5 ("Object is invalid" on the next property read, seen live 2026-10-02).
    S6.templateName = String(comp.motionGraphicsTemplateName);
    S6.properties = comp.motionGraphicsTemplateControllerCount;
    rv = comp.exportAsMotionGraphicsTemplate(true, new Folder(PARAMS.outDir).fsName);
  } finally {
    app.endSuppressDialogs(false);
  }
  return String(rv);
}

// https://ae-scripting.docsforadobe.dev/text/fontsobject/ (getFontsByPostScriptName, AE 24.0+). A missing
// font would raise a dialog on open; a substitute reports a location outside the font's own file (#187).
var ok = check('SB Sans fonts installed, not substituted', function () {
  var rows = [];
  var good = true;
  var i, list, f, loc;
  for (i = 0; i < PARAMS.fonts.length; i++) {
    list = app.fonts.getFontsByPostScriptName(PARAMS.fonts[i]);
    f = list.length ? list[0] : null;
    loc = f ? String(f.location) : '';
    if (!f || f.isSubstitute === true || (loc !== '' && !/sbsans/i.test(loc))) {
      good = false;
    }
    rows.push({ ps: PARAMS.fonts[i], found: f !== null, location: loc });
  }
  return { pass: good, detail: rows };
});

ok = ok && check('S6 copy of CRT_fixture_egp.aep is the open project', function () {
  S6.open = s6Open();
  return { pass: s6IsCopyOpen(), detail: { open: s6OpenPath(), how: S6.open } };
});

ok = ok && check('template comp ' + PARAMS.comp + ' found once', function () {
  s6Comp = s6CompNamed(PARAMS.comp);
  return {
    pass: true,
    detail: { id: s6Comp.id, templateName: String(s6Comp.motionGraphicsTemplateName), properties: s6Comp.motionGraphicsTemplateControllerCount }
  };
});

if (ok && PARAMS.mode === 'changed') {
  ok = check('QA_PATCH recoloured to ' + PARAMS.hex + ' with a Fill effect', function () {
    var layer = s6LayerNamed(s6Comp, 'QA_PATCH');
    var fx = null;
    var color = null;
    var back, i;
    app.beginUndoGroup('BK S6 recolour');
    try {
      layer.property('ADBE Effect Parade').addProperty('ADBE Fill');
      // Fresh references after addProperty (ae-quirks #3); the colour is found by its value type, not by a
      // localized name. A solid cannot be recoloured after creation (ae-quirks #7), hence the Fill effect.
      fx = layer.property('ADBE Effect Parade').property(layer.property('ADBE Effect Parade').numProperties);
      for (i = 1; i <= fx.numProperties; i++) {
        if (fx.property(i).propertyValueType === PropertyValueType.COLOR) {
          color = fx.property(i);
          break;
        }
      }
      if (!color) {
        throw new Error('BK_NO_COLOR_PARAM in ' + fx.matchName);
      }
      color.setValue([PARAMS.rgb[0], PARAMS.rgb[1], PARAMS.rgb[2], 1]);
      back = color.value;
    } finally {
      app.endUndoGroup();
    }
    S6.fill = { effect: fx.matchName, param: color.matchName, value: [back[0], back[1], back[2]] };
    return {
      pass: Math.abs(back[0] - PARAMS.rgb[0]) < 0.01 && Math.abs(back[1] - PARAMS.rgb[1]) < 0.01 && Math.abs(back[2] - PARAMS.rgb[2]) < 0.01,
      detail: S6.fill
    };
  });
}

if (ok && PARAMS.mode === 'dup') {
  ok = check('master comp duplicated as ' + PARAMS.dupName, function () {
    var dup;
    app.beginUndoGroup('BK S6 duplicate');
    try {
      dup = s6Comp.duplicate();
      dup.name = PARAMS.dupName;
      dup.motionGraphicsTemplateName = PARAMS.dupName;
    } finally {
      app.endUndoGroup();
    }
    S6.dup = { master: s6Comp.motionGraphicsTemplateControllerCount, dup: dup.motionGraphicsTemplateControllerCount };
    s6Comp = dup;
    return { pass: dup.name === PARAMS.dupName, detail: S6.dup };
  });
  check('the duplicate keeps the Essential Graphics properties', function () {
    return { pass: !!S6.dup && S6.dup.dup === S6.dup.master, detail: S6.dup || null };
  }, false);
}

if (ok) {
  check(PARAMS.mode + ': exportAsMotionGraphicsTemplate called (Node waits for the file)', function () {
    S6.returned = s6Export(s6Comp);
    return { pass: true, detail: { returned: S6.returned, templateName: S6.templateName, properties: S6.properties } };
  });
}

finish(S6);
