// E2E fixture of the panel in AE (plan 2026-10-05, task 10), after spikes/lib/check.jsx and spikes/lib/ae-project.jsx.
// PARAMS: workDir, path (ASCII .aep under the work folder), comps [{ name, w, h, fps, dur }]. Opens the fixture,
// or makes it in a new project when missing, adds missing comps and saves only when something was added. The
// ae-project helpers refuse to close a dirty project that is not ours (the user's work), so nothing of the user's
// is ever closed. Returns finish({ path, made, comps: [{ name, id, w, h, fps }] }).
var P = PARAMS;
var data = { path: P.path, made: [], comps: [] };

var ready = check('fixture project ' + P.path, function () {
  var f = new File(P.path);
  var how;
  if (app.project && app.project.file && bkNorm(app.project.file.fsName) === bkNorm(f.fsName)) {
    how = 'active';
  } else if (f.exists) {
    bkOpenProject(P.path);
    how = 'opened';
  } else {
    bkNewProject();
    how = 'new';
  }
  data.how = how;
  return { pass: true, detail: how };
});

if (ready) {
  check('fixture comps', function () {
    app.beginUndoGroup('CRBK fixture comps');
    try {
      for (var i = 0; i < P.comps.length; i++) {
        var c = P.comps[i];
        var comp = bkFindItem(c.name, CompItem);
        if (!comp) {
          comp = app.project.items.addComp(c.name, c.w, c.h, 1, c.dur, c.fps);
          data.made.push(c.name);
        }
        data.comps.push({ name: String(comp.name), id: String(comp.id), w: comp.width, h: comp.height, fps: comp.frameRate });
      }
    } finally {
      app.endUndoGroup();
    }
    return { pass: data.comps.length === P.comps.length, detail: data.made };
  });
  if (data.made.length || data.how === 'new') {
    check('fixture saved', function () {
      var r = bkSaveAs(P.path);
      return { pass: !r.dirty, detail: r };
    });
  }
}

finish(data);
