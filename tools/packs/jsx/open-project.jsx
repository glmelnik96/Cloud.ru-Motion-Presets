// Open PARAMS.path in AE. Refuses when the open project has unsaved changes: app.open would ask
// to save, and that modal blocks the bridge. Never closes or discards anything itself.
// app.open: https://ae-scripting.docsforadobe.dev/general/application/#appopen
// beginSuppressDialogs only hides SCRIPT error dialogs; a "files are missing" warning may still
// appear on open. Then the call times out and a person closes the dialog (see openProject).
var out = { ok: false };
try {
  if (app.project.dirty) {
    out.error = 'AE_DIRTY';
    out.detail = app.project.file ? app.project.file.fsName : 'untitled';
  } else {
    var f = new File(PARAMS.path);
    if (!f.exists) {
      out.error = 'NO_FILE';
      out.detail = PARAMS.path;
    } else {
      app.beginSuppressDialogs();
      try {
        app.open(f);
      } finally {
        app.endSuppressDialogs(false);
      }
      out.ok = true;
      out.file = app.project.file ? app.project.file.fsName : null;
      out.dirty = app.project.dirty;
      // A project saved by an older AE opens as an untitled converted project (AE 26.5): no file
      // yet, so Node gets a fingerprint to recognise it in the next calls.
      out.converted = out.file === null;
      out.fingerprint = {
        items: app.project.numItems,
        first: app.project.numItems > 0 ? app.project.item(1).name : null
      };
    }
  }
} catch (e) {
  out.error = 'EXC';
  out.detail = String(e) + ' (line ' + e.line + ')';
}
JSON.stringify(out);
