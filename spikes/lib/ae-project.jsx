// Project helpers for AE spike probes (ES3). Load after spikes/lib/check.jsx; needs PARAMS.workDir.
// Probes open, build and close only projects inside the ASCII work folder. A dirty project from
// anywhere else is the user's work: the helpers refuse (throw) instead of closing it, so AE never
// shows a "save changes?" modal that would block the bridge (ae-quirks #25).
// Docs: https://ae-scripting.docsforadobe.dev/general/project/ (dirty 17.5+, close, save),
//       https://ae-scripting.docsforadobe.dev/general/application/ (open, newProject).
function bkNorm(p) {
  return String(p).replace(/\\/g, '/').toLowerCase();
}

function bkIsWorkPath(p) {
  var root = bkNorm(PARAMS.workDir);
  if (root.charAt(root.length - 1) !== '/') {
    root = root + '/';
  }
  return bkNorm(p).substr(0, root.length) === root;
}

function bkProjectPath() {
  var f = app.project ? app.project.file : null;
  return f ? String(f.fsName) : '';
}

// Runs fn with AE script-error dialogs suppressed (open, import, save, presets, render) and always ends
// the suppression; endSuppressDialogs(false) does not show the suppressed errors afterwards. Prompts such
// as "save changes?" are not covered (docs: application/), so the helpers avoid them by design.
function bkQuiet(fn) {
  app.beginSuppressDialogs();
  try {
    return fn();
  } finally {
    app.endSuppressDialogs(false);
  }
}

// Clean project: nothing to do. Dirty project of ours: close without saving. Anything else: refuse.
function bkReleaseProject() {
  var cur = app.project;
  if (!cur || cur.dirty !== true) {
    return 'clean';
  }
  var p = bkProjectPath();
  if (p === '' || !bkIsWorkPath(p)) {
    throw new Error('BK_DIRTY_USER_PROJECT: save or close the open project first (' + (p || 'untitled') + ')');
  }
  cur.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  return 'closed';
}

function bkOpenProject(path) {
  var f = new File(path);
  if (!f.exists) {
    throw new Error('BK_NO_FILE: ' + path);
  }
  bkReleaseProject();
  var p = bkQuiet(function () {
    return app.open(f);
  });
  if (!p) {
    throw new Error('BK_OPEN_FAILED: ' + path);
  }
  return p;
}

function bkNewProject() {
  bkReleaseProject();
  var p = app.newProject();
  if (!p) {
    throw new Error('BK_NEW_PROJECT_FAILED');
  }
  return p;
}

// Save As into the work folder. Project.save(File) saves without a prompt (docs).
function bkSaveAs(path) {
  if (!bkIsWorkPath(path)) {
    throw new Error('BK_NOT_WORK_PATH: ' + path);
  }
  bkQuiet(function () {
    app.project.save(new File(path));
  });
  var f = new File(path);
  if (!f.exists) {
    throw new Error('BK_SAVE_FAILED: ' + path);
  }
  return { path: String(f.fsName), bytes: f.length, dirty: app.project.dirty };
}

// Exactly one project item with this name (and constructor), else null; duplicates throw, because
// acting on the first of two same-named items is how templates go wrong (spec 4.2).
function bkFindItem(name, ctor) {
  var hits = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item.name === name && (!ctor || item instanceof ctor)) {
      hits.push(item);
    }
  }
  if (hits.length > 1) {
    throw new Error('BK_DUPLICATE_ITEM: ' + name + ' x' + hits.length);
  }
  return hits.length ? hits[0] : null;
}

function bkComp(name) {
  var c = bkFindItem(name, CompItem);
  if (!c) {
    throw new Error('BK_NO_COMP: ' + name);
  }
  return c;
}

function bkLayer(comp, name) {
  var hits = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    if (comp.layer(i).name === name) {
      hits.push(comp.layer(i));
    }
  }
  if (hits.length !== 1) {
    throw new Error('BK_LAYER: ' + name + ' x' + hits.length + ' in ' + comp.name);
  }
  return hits[0];
}

// AE 26.5 turns every Dropdown Menu Control into a per-instance pseudo effect: it is added as
// 'ADBE Dropdown Control' but reports matchName "Pseudo/@@<id>". A dropdown is told by its menu instead.
function bkMatchName(fx, matchName) {
  if (!matchName || fx.matchName === matchName) {
    return true;
  }
  if (matchName === 'ADBE Dropdown Control') {
    try {
      return fx.property(1).isDropdownEffect === true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// An effect by the ASCII name we gave it plus its match name; never by a localized display name.
function bkEffect(layer, name, matchName) {
  var parade = layer.property('ADBE Effect Parade');
  for (var i = 1; i <= parade.numProperties; i++) {
    var fx = parade.property(i);
    if (fx.name === name && bkMatchName(fx, matchName)) {
      return fx;
    }
  }
  throw new Error('BK_EFFECT: ' + name + ' on ' + layer.name);
}

function bkSourceText(layer) {
  return layer.property('ADBE Text Properties').property('ADBE Text Document');
}

// Composition markers as data. keyTime/keyValue only inside 1..numKeys: a miss "displays an error" (docs).
function bkMarkers(comp) {
  var mk = comp.markerProperty;
  var out = [];
  for (var k = 1; k <= mk.numKeys; k++) {
    var v = mk.keyValue(k);
    out.push({ time: mk.keyTime(k), comment: v.comment, duration: v.duration, protectedRegion: v.protectedRegion === true });
  }
  return out;
}

// Every property that carries an expression: [{ layerIndex, layerName, idx: [property indices], label }].
// Indices, not references: references go stale after edits (ae-quirks #3).
function bkExpressionProps(comp) {
  var out = [];
  function walk(group, layerIndex, layerName, idx, label) {
    var n = 0;
    try {
      n = group.numProperties;
    } catch (e0) {
      n = 0;                       // some groups refuse to enumerate; nothing of ours lives there
    }
    for (var i = 1; i <= n; i++) {
      var p = null;
      try {
        p = group.property(i);
      } catch (e1) {
        p = null;
      }
      if (p === null) {
        continue;
      }
      var here = idx.concat([i]);
      var name = label + '/' + p.matchName;
      if (p.propertyType === PropertyType.PROPERTY) {
        var has = false;
        try {
          has = p.canSetExpression && p.expression !== '';
        } catch (e2) {
          has = false;
        }
        if (has) {
          out.push({ layerIndex: layerIndex, layerName: layerName, idx: here, label: name });
        }
      } else {
        walk(p, layerIndex, layerName, here, name);
      }
    }
  }
  for (var j = 1; j <= comp.numLayers; j++) {
    walk(comp.layer(j), j, comp.layer(j).name, [], comp.layer(j).name);
  }
  return out;
}

function bkResolve(comp, entry) {
  var p = comp.layer(entry.layerIndex);
  for (var i = 0; i < entry.idx.length; i++) {
    p = p.property(entry.idx[i]);
  }
  return p;
}

function bkNow() {
  return new Date().getTime();
}
