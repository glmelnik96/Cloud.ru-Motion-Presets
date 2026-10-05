// Live E2E of the panel in AE (plan 2026-10-05, task 10), after spikes/lib/check.jsx and spikes/lib/ae-project.jsx.
// An observer independent of the panel's adapter: it prepares the target and reads back what the panel inserted.
// It works only in the E2E fixture (PARAMS.fixture must be the open project) and never saves it.
// PARAMS: workDir, fixture, stage 'prepare' | 'read', comp (fixture comp name), time (s);
//         read: aeComp (the variant comp the layer must show), egpNames (Essential Properties to read).
// prepare: removes earlier inserts (layers of CR_* comps) from the comp, opens it, sets the time -> { compId }.
// read: the one layer of aeComp starting at `time` -> { start, in, out, selected, remap: { on, keys }, values }.
var P = PARAMS;
var data = {};

function e2eEpGroup(layer) {
  var g = null;
  try { g = layer.essentialProperty; } catch (e) { g = null; }
  if (!g) {
    try { g = layer.property('ADBE Layer Overrides'); } catch (e2) { g = null; }
  }
  return g;
}

// Depth-first by display name; names are compared, never used as object keys (AE objects inherit '-', '/' members).
function e2eFind(group, name) {
  var i, p, r;
  for (i = 1; i <= group.numProperties; i++) {
    p = group.property(i);
    if (p.name === name && p.propertyType === PropertyType.PROPERTY) {
      return p;
    }
    if (p.propertyType !== PropertyType.PROPERTY) {
      r = e2eFind(p, name);
      if (r) {
        return r;
      }
    }
  }
  return null;
}

function e2eValue(p) {
  var v = p.value;
  if (v && typeof v === 'object' && v.text !== undefined) {
    return String(v.text);
  }
  return typeof v === 'number' || typeof v === 'boolean' ? v : String(v);
}

var ready = check('fixture is the open project', function () {
  var f = app.project.file;
  return { pass: !!f && bkNorm(f.fsName) === bkNorm(new File(P.fixture).fsName), detail: f ? String(f.fsName) : 'untitled' };
});

var comp = null;
if (ready) {
  ready = check('comp ' + P.comp, function () {
    comp = bkComp(P.comp);
    return { pass: true, detail: String(comp.id) };
  });
}

if (ready && P.stage === 'prepare') {
  check('earlier inserts removed', function () {
    var removed = 0, i, l;
    app.beginUndoGroup('CRBK e2e clean');
    try {
      for (i = comp.numLayers; i >= 1; i--) {
        l = comp.layer(i);
        if (l.source && l.source instanceof CompItem && /^CR_/.test(l.source.name)) {
          l.remove();
          removed++;
        }
      }
    } finally {
      app.endUndoGroup();
    }
    return { pass: true, detail: removed };
  });
  check('comp active at ' + P.time + ' s', function () {
    comp.openInViewer();
    comp.time = P.time;
    var a = app.project.activeItem;
    data.compId = String(comp.id);
    return { pass: !!a && a.id === comp.id && Math.abs(comp.time - P.time) < 1e-6, detail: a ? String(a.name) : 'none' };
  });
}

if (ready && P.stage === 'read') {
  check('one layer of ' + P.aeComp + ' at ' + P.time + ' s', function () {
    var hits = [], i, l, half = 0.5 / comp.frameRate;
    for (i = 1; i <= comp.numLayers; i++) {
      l = comp.layer(i);
      if (l.source && l.source.name === P.aeComp && Math.abs(l.startTime - P.time) < half) {
        hits.push(l);
      }
    }
    if (hits.length !== 1) {
      return { pass: false, detail: hits.length + ' layers' };
    }
    l = hits[0];
    data.start = l.startTime;
    data['in'] = l.inPoint;
    data.out = l.outPoint;
    data.selected = l.selected;
    data.selectedCount = comp.selectedLayers.length;
    data.remap = { on: l.timeRemapEnabled, keys: [] };
    if (l.timeRemapEnabled) {
      var tr = l.property('ADBE Time Remapping');
      for (i = 1; i <= tr.numKeys; i++) {
        data.remap.keys.push([tr.keyTime(i) - l.startTime, tr.keyValue(i)]);
      }
    }
    data.values = [];
    var g = e2eEpGroup(l);
    for (i = 0; i < P.egpNames.length; i++) {
      var p = g ? e2eFind(g, P.egpNames[i]) : null;
      data.values.push([P.egpNames[i], p ? e2eValue(p) : null]);
    }
    return { pass: true, detail: l.name };
  });
}

finish(data);
