// Cheap read: which project is open in AE and whether it has unsaved changes.
// Project.dirty: AE 17.5+ (https://ae-scripting.docsforadobe.dev/general/project/#projectdirty)
var state = {
  ok: true,
  file: app.project.file ? app.project.file.fsName : null,
  dirty: app.project.dirty,
  version: String(app.version)
};
JSON.stringify(state);
