// S8, AE stage: open one copy of a relinked pack, find one existing comp by its exact name and export it
// as a MOGRT with no Essential Graphics properties ("as is"), to measure its cost in Premiere.
// PARAMS: { slug, aepPath, copyDir, compNames: [NFC, NFD], folderName, templateName, mogrtDir }
// Node polls the .mogrt file afterwards: since 24.x the export may return before the file is written.
// Docs: https://ae-scripting.docsforadobe.dev/general/application/ (app.open, beginSuppressDialogs)
//       https://ae-scripting.docsforadobe.dev/general/project/ (Project.dirty since 17.5, save(file))
//       https://ae-scripting.docsforadobe.dev/item/compitem/ (openInEssentialGraphics,
//       motionGraphicsTemplateName, exportAsMotionGraphicsTemplate(overwrite, folderPath): 15.0+)

var S8 = { comp: null, facts: null, timings: {}, exportCalled: false, exportReturned: null, opened: null };
var S8_TAG = 'ae ' + PARAMS.slug + ': ';

function s8Now() {
  return new Date().getTime();
}

function s8NameMatches(name) {
  var i;
  for (i = 0; i < PARAMS.compNames.length; i++) {
    if (name === PARAMS.compNames[i]) { return true; }
  }
  return false;
}

function s8FindComps() {
  var hits = [], i, it;
  for (i = 1; i <= app.project.numItems; i++) {
    it = app.project.item(i);
    if (it instanceof CompItem && s8NameMatches(it.name)) { hits.push(it); }
  }
  return hits;
}

function s8MissingFootage() {
  var out = { count: 0, names: [] }, i, it;
  for (i = 1; i <= app.project.numItems; i++) {
    it = app.project.item(i);
    if (it instanceof FootageItem && it.footageMissing) {
      out.count += 1;
      if (out.names.length < 10) { out.names.push(it.name); }
    }
  }
  return out;
}

// Top-level layers only: enough to explain the cost (motion blur, 3D, adjustment, precomps, effects).
function s8Facts(comp) {
  var f = {
    name: comp.name, width: comp.width, height: comp.height, fps: comp.frameRate,
    duration: comp.duration, renderer: String(comp.renderer), compMotionBlur: comp.motionBlur,
    layers: comp.numLayers, motionBlurLayers: 0, threeDLayers: 0, adjustmentLayers: 0,
    precompLayers: 0, effects: []
  };
  var seen = {}, i, j, L, fx, mn;
  for (i = 1; i <= comp.numLayers; i++) {
    L = comp.layer(i);
    try {
      if (L.motionBlur === true) { f.motionBlurLayers += 1; }
      if (L.threeDLayer === true) { f.threeDLayers += 1; }
      if (L.adjustmentLayer === true) { f.adjustmentLayers += 1; }
      if (L.source && (L.source instanceof CompItem)) { f.precompLayers += 1; }
      fx = L.property('ADBE Effect Parade');
      if (fx) {
        for (j = 1; j <= fx.numProperties; j++) {
          mn = fx.property(j).matchName;
          if (!seen[mn]) {
            seen[mn] = true;
            f.effects.push(mn);
          }
        }
      }
    } catch (e) {
      f.effects.push('ERR layer ' + i + ': ' + String(e));
    }
  }
  return f;
}

// Never discard the user's work: a changed project blocks the run, unless it is one of our own copies
// in PARAMS.copyDir (left changed by a previous pack), which is closed without saving.
var s8Ok = check(S8_TAG + 'open project is saved or is an S8 copy', function () {
  var f = app.project.file;
  var p = f ? String(f.fsName).replace(/\\/g, '/').toLowerCase() : '';
  var dir = String(PARAMS.copyDir).toLowerCase();
  var own = p !== '' && p.substr(0, dir.length) === dir;
  if (app.project.dirty === true && own) {
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    return { pass: true, detail: 'closed the previous S8 copy without saving: ' + p };
  }
  return { pass: app.project.dirty !== true, detail: 'dirty=' + app.project.dirty + ' file=' + (p || 'untitled') };
});

if (s8Ok) {
  s8Ok = check(S8_TAG + 'pack copy opened', function () {
    var f = new File(PARAMS.aepPath), p = null, t = s8Now();
    if (!f.exists) { return { pass: false, detail: 'missing ' + PARAMS.aepPath }; }
    app.beginSuppressDialogs();
    try {
      p = app.open(f);
    } finally {
      app.endSuppressDialogs(false);
    }
    S8.timings.openMs = s8Now() - t;
    S8.opened = (p && p.file) ? p.file.fsName : null;
    return { pass: p !== null, detail: 'file=' + S8.opened + ' engine=' + (p ? p.expressionEngine : '') + ' in ' + S8.timings.openMs + ' ms' };
  });
}

if (s8Ok) {
  s8Ok = check(S8_TAG + 'no missing footage', function () {
    var m = s8MissingFootage();
    return { pass: m.count === 0, detail: m.count + ' missing' + (m.count ? ': ' + m.names.join(', ') : '') };
  });
}

if (s8Ok) {
  s8Ok = check(S8_TAG + 'exactly one comp with the given name', function () {
    var hits = s8FindComps(), inFolder = [], i;
    if (hits.length === 1) {
      S8.comp = hits[0];
    } else {
      for (i = 0; i < hits.length; i++) {
        if (hits[i].parentFolder && hits[i].parentFolder.name === PARAMS.folderName) { inFolder.push(hits[i]); }
      }
      if (inFolder.length === 1) { S8.comp = inFolder[0]; }
    }
    return { pass: S8.comp !== null, detail: hits.length + ' by name, picked ' + (S8.comp ? 'item id ' + S8.comp.id : 'none') };
  });
}

if (s8Ok) {
  check(S8_TAG + 'comp facts recorded', function () {
    S8.facts = s8Facts(S8.comp);
    return { pass: true, detail: S8.facts.width + 'x' + S8.facts.height + ' ' + S8.facts.fps + ' fps ' + S8.facts.duration + ' s' };
  }, false);
  // Contract 4.2 wants Classic 3D; Advanced 3D (ADBE Calder) is recorded, not fixed: S8 exports comps as they are.
  check(S8_TAG + 'renderer is not Advanced 3D (ADBE Calder)', function () {
    return { pass: String(S8.comp.renderer) !== 'ADBE Calder', detail: 'renderer=' + S8.comp.renderer };
  }, false);
}

if (s8Ok) {
  s8Ok = check(S8_TAG + 'template name set in Essential Graphics', function () {
    var count = -1;
    app.beginUndoGroup('BK S8 template name');
    try {
      try { S8.comp.openInViewer(); } catch (e0) { /* the viewer is optional for the export */ }
      S8.comp.openInEssentialGraphics();
      S8.comp.motionGraphicsTemplateName = PARAMS.templateName;
      // AE 26.5 does not export a template without Essential Graphics properties: the call returns
      // false at once and writes nothing (seen live 2026-10-02). The comps are measured as they are,
      // so one neutral property is exposed: the opacity of the first layer that has one (cameras and
      // lights do not). Exposing a property changes no pixel.
      for (var li = 1; S8.comp.motionGraphicsTemplateControllerCount === 0 && li <= S8.comp.numLayers; li++) {
        var tg = S8.comp.layer(li).property('ADBE Transform Group');
        var op = tg ? tg.property('ADBE Opacity') : null;
        if (op && op.canAddToMotionGraphicsTemplate(S8.comp) &&
            op.addToMotionGraphicsTemplateAs(S8.comp, 'Opacity (S8 export)')) {
          S8.addedForExport = S8.comp.layer(li).name;
        }
      }
    } finally {
      app.endUndoGroup();
    }
    try { count = S8.comp.motionGraphicsTemplateControllerCount; } catch (e1) { count = -1; }
    return { pass: S8.comp.motionGraphicsTemplateName === PARAMS.templateName && count > 0,
      detail: 'name=' + S8.comp.motionGraphicsTemplateName + ' properties=' + count +
        (S8.addedForExport ? ' (added for export: opacity of ' + S8.addedForExport + ')' : '') };
  });
}

if (s8Ok) {
  // The export prompts to save a changed project; save the copy first (same path).
  s8Ok = check(S8_TAG + 'project copy saved before export', function () {
    var t = s8Now();
    app.beginSuppressDialogs();
    try {
      app.project.save(new File(PARAMS.aepPath));
    } finally {
      app.endSuppressDialogs(false);
    }
    S8.timings.saveMs = s8Now() - t;
    return { pass: app.project.dirty !== true, detail: 'dirty=' + app.project.dirty + ' in ' + S8.timings.saveMs + ' ms' };
  });
}

if (s8Ok) {
  check(S8_TAG + 'exportAsMotionGraphicsTemplate called', function () {
    var t = s8Now(), rv = null;
    app.beginSuppressDialogs();
    try {
      rv = S8.comp.exportAsMotionGraphicsTemplate(true, new Folder(PARAMS.mogrtDir).fsName);
    } finally {
      app.endSuppressDialogs(false);
    }
    S8.timings.exportCallMs = s8Now() - t;
    S8.exportCalled = true;
    S8.exportReturned = rv;
    // The return value is recorded, not trusted: Node decides by the file.
    return { pass: true, detail: 'returned ' + String(rv) + ' after ' + S8.timings.exportCallMs + ' ms' };
  });
}

finish({
  slug: PARAMS.slug, facts: S8.facts, timings: S8.timings, opened: S8.opened,
  exportCalled: S8.exportCalled, exportReturned: S8.exportReturned
});
