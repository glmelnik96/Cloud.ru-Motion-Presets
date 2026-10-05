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

// The work area ends at PARAMS.endSec: a loop with no length runs up to it (media checks).
function lvRange() {
  check('work area of comp ' + PARAMS.id + ' ends at ' + PARAMS.endSec + ' s', function () {
    var c = lvComp(PARAMS.id);
    c.workAreaStart = 0;
    c.workAreaDuration = PARAMS.endSec;
    return Math.abs(c.workAreaStart + c.workAreaDuration - PARAMS.endSec) < 0.001;
  });
}

// Every layer of the comp as the media checks read it: times, file, Interpret Footage loop, solid colour.
function lvTimeline() {
  check('layers of comp ' + PARAMS.id + ' listed', function () {
    var c = lvComp(PARAMS.id);
    var out = [];
    var i, l, src, ms, bin, footage;
    for (i = 1; i <= c.numLayers; i++) {
      l = c.layer(i);
      src = l.source;
      ms = null;
      try { ms = src ? src.mainSource : null; } catch (e) { ms = null; }
      out.push({
        index: i,
        name: String(l.name),
        startSec: Math.round(l.inPoint * 1000) / 1000,
        endSec: Math.round(l.outPoint * 1000) / 1000,
        file: src && src.file ? String(src.file.fsName).split('\\').join('/') : null,
        loop: ms && ms.isStill === false && ms.loop !== undefined ? ms.loop : null,
        solid: ms && typeof SolidSource !== 'undefined' && ms instanceof SolidSource ? [Math.round(ms.color[0] * 255), Math.round(ms.color[1] * 255), Math.round(ms.color[2] * 255)] : null,
        audioOnly: l.hasAudio === true && l.hasVideo === false,
        selected: l.selected
      });
    }
    footage = 0;
    for (i = 1; i <= app.project.rootFolder.numItems; i++) {
      if (app.project.rootFolder.item(i).name === 'Cloud.ru BrandKit') {
        bin = app.project.rootFolder.item(i);
      }
    }
    for (i = 1; bin && i <= bin.numItems; i++) {
      if (bin.item(i) instanceof FootageItem) {
        footage += 1;
      }
    }
    DATA.layers = out;
    DATA.binFootage = footage;
    return true;
  });
}

// Effects checks: a text layer and a solid in the comp, selected by name, read back per layer.
function lvFxLayers() {
  check('a text layer and a solid in comp ' + PARAMS.id, function () {
    var c = lvComp(PARAMS.id);
    var t = c.layers.addText('Анна Проверкина');
    var s = c.layers.addSolid([0.15, 0.82, 0.49], 'BK Плашка', 600, 120, 1, c.duration);
    t.name = 'BK Имя';
    DATA.layers = { text: t.id, solid: s.id };
    return true;
  });
}

function lvSelect() {
  check('comp ' + PARAMS.id + ': selected ' + (PARAMS.names.join(', ') || 'nothing'), function () {
    var c = lvComp(PARAMS.id);
    var i, l, n;
    c.openInViewer();
    for (i = 1; i <= c.numLayers; i++) {
      l = c.layer(i);
      l.selected = false;
      for (n = 0; n < PARAMS.names.length; n++) {
        if (l.name === PARAMS.names[n]) {
          l.selected = true;
        }
      }
    }
    c.time = PARAMS.time;
    return c.selectedLayers.length === PARAMS.names.length;
  });
}

function lvFxKeys(group, depth, acc) {
  var i, p;
  if (!group || depth > 6) {
    return acc;
  }
  for (i = 1; i <= group.numProperties; i++) {
    p = group.property(i);
    if (p.propertyType === PropertyType.PROPERTY) {
      if (p.numKeys > 0 && (acc.first === null || p.keyTime(1) < acc.first)) {
        acc.first = p.keyTime(1);
      }
    } else {
      lvFxKeys(p, depth + 1, acc);
    }
  }
  return acc;
}

function lvFxRead() {
  check('effects of comp ' + PARAMS.id + ' read', function () {
    var c = lvComp(PARAMS.id);
    var out = [];
    var i, l, fx, anim, acc;
    for (i = 1; i <= c.numLayers; i++) {
      l = c.layer(i);
      fx = l.property('ADBE Effect Parade');
      anim = null;
      try { anim = l.property('ADBE Text Properties').property('ADBE Text Animators'); } catch (e) { anim = null; }
      acc = lvFxKeys(fx, 0, { first: null });
      lvFxKeys(anim, 0, acc);
      out.push({ name: String(l.name), effects: fx ? fx.numProperties : 0, animators: anim ? anim.numProperties : 0,
        firstKey: acc.first === null ? null : Math.round(acc.first * 1000) / 1000 });
    }
    DATA.fx = out;
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
} else if (PARAMS.op === 'range') {
  lvRange();
} else if (PARAMS.op === 'timeline') {
  lvTimeline();
} else if (PARAMS.op === 'fxLayers') {
  lvFxLayers();
} else if (PARAMS.op === 'select') {
  lvSelect();
} else if (PARAMS.op === 'fxRead') {
  lvFxRead();
} else if (PARAMS.op === 'save') {
  lvSave();
}
finish(DATA);
