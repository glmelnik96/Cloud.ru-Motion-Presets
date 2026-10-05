// Live checks of the panel in After Effects (ES3): the test bed around the adapter, not the adapter itself.
// Loaded after PARAMS, spikes/lib/check.jsx and spikes/lib/ae-project.jsx; PARAMS.op picks the step.
// The adapter (panel/host) is called through the panel bridge; these steps only build the scratch project,
// switch the active comp, render frames and read what the adapter left behind.
var DATA = { op: PARAMS.op };

function lvComp(id) {
  var c = app.project.itemByID(Number(id));
  if (!(c instanceof CompItem)) {
    throw new Error('BK_NO_COMP: ' + id);
  }
  return c;
}

// A new scratch project in the work folder with one comp per case; a dirty project of the user is refused
// (bkReleaseProject throws), so AE never shows a save prompt.
function lvSetup() {
  check('scratch project created and saved in the work folder', function () {
    var ids = {};
    var i, s, c;
    bkNewProject();
    for (i = 0; i < PARAMS.targets.length; i++) {
      s = PARAMS.targets[i];
      c = app.project.items.addComp(s.name, s.w, s.h, 1, s.dur, s.fps);
      ids[s.key] = String(c.id);
    }
    DATA.ids = ids;
    DATA.saved = bkSaveAs(PARAMS.project);
    return { pass: DATA.saved.bytes > 0, detail: { comps: PARAMS.targets.length, path: DATA.saved.path } };
  });
}

// The comp becomes the active item (open in its viewer) at the given time, as a user would leave it.
function lvActivate() {
  check('comp ' + PARAMS.id + ' active at ' + PARAMS.time + ' s', function () {
    var c = lvComp(PARAMS.id);
    c.openInViewer();
    c.time = PARAMS.time;
    var a = app.project.activeItem;
    return { pass: !!a && a.id === c.id && Math.abs(c.time - PARAMS.time) < 0.001, detail: { active: a ? a.name : null } };
  });
}

// Frames for Node to compare; saveFrameToPng returns before the file is written (ae-quirks #27).
function lvFrames() {
  check('frames requested: ' + PARAMS.frames.length, function () {
    var i, f, c;
    for (i = 0; i < PARAMS.frames.length; i++) {
      f = PARAMS.frames[i];
      c = lvComp(f.compId);
      c.resolutionFactor = [1, 1];
      c.saveFrameToPng(f.t, new File(f.file));
    }
    return true;
  });
}

// What the adapter left on a layer: scale, time remap keys, in and out.
function lvLayer() {
  check('layer ' + PARAMS.layerId + ' read', function () {
    var l = app.project.layerByID(Number(PARAMS.layerId));
    var tr, keys, k;
    if (!l) {
      return { pass: false, detail: 'no layer' };
    }
    keys = [];
    if (l.timeRemapEnabled) {
      tr = l.property('ADBE Time Remapping');
      for (k = 1; k <= tr.numKeys; k++) {
        keys.push([Math.round((tr.keyTime(k) - l.startTime) * 1000) / 1000, Math.round(tr.keyValue(k) * 1000) / 1000,
          tr.keyInInterpolationType(k) === KeyframeInterpolationType.LINEAR]);
      }
    }
    DATA.layer = {
      name: l.name,
      inPoint: Math.round(l.inPoint * 1000) / 1000,
      outPoint: Math.round(l.outPoint * 1000) / 1000,
      scale: l.property('ADBE Transform Group').property('ADBE Scale').value,
      timeRemap: l.timeRemapEnabled,
      keys: keys,
      selected: l.selected,
      comp: l.containingComp.name
    };
    return true;
  });
}

function lvCount() {
  check('layers of comp ' + PARAMS.id + ' counted', function () {
    var c = lvComp(PARAMS.id);
    var bin = null;
    var i;
    for (i = 1; i <= app.project.rootFolder.numItems; i++) {
      if (app.project.rootFolder.item(i).name === 'Cloud.ru BrandKit') {
        bin = app.project.rootFolder.item(i);
      }
    }
    DATA.count = { layers: c.numLayers, templates: bin ? bin.numItems : 0 };
    return true;
  });
}

function lvSave() {
  check('scratch project saved', function () {
    bkQuiet(function () {
      app.project.save();
    });
    return app.project.dirty === false;
  }, false);
}

if (PARAMS.op === 'setup') {
  lvSetup();
} else if (PARAMS.op === 'activate') {
  lvActivate();
} else if (PARAMS.op === 'frames') {
  lvFrames();
} else if (PARAMS.op === 'layer') {
  lvLayer();
} else if (PARAMS.op === 'count') {
  lvCount();
} else if (PARAMS.op === 'save') {
  lvSave();
}
finish(DATA);
