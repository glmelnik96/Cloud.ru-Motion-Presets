// Close the open project WITHOUT saving, but only if it is PARAMS.expect: one of our working
// copies under C:/CRBK, whose only edits are our own (preview resolution set by the golden render).
// Project.close: https://ae-scripting.docsforadobe.dev/general/project/#projectclose
var out = { ok: false };
try {
  var cur = app.project.file ? app.project.file.fsName.replace(/\\/g, '/') : '';
  var want = String(PARAMS.expect).replace(/\\/g, '/');
  if (cur.toLowerCase() !== want.toLowerCase()) {
    out.error = 'NOT_EXPECTED_PROJECT';
    out.detail = cur;
  } else {
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    out.ok = true;
  }
} catch (e) {
  out.error = 'EXC';
  out.detail = String(e) + ' (line ' + e.line + ')';
}
JSON.stringify(out);
