// Relink one pack copy in AE (Plan 2, Task 3). PARAMS:
//   expect  the copy that must be open (AE may call an older-version project "<name> (converted).aep")
//   mode    'scan'   list every file footage item with its current or missing path
//           'apply'  replace PARAMS.replace = [{ id, name, path }], Save As PARAMS.saveAs, then report
//           'report' footage + fonts of the open project, no changes
// Docs: FootageItem.replace  https://ae-scripting.docsforadobe.dev/item/footageitem/#footageitemreplace
//       missingFootagePath   https://ae-scripting.docsforadobe.dev/sources/filesource/#filesourcemissingfootagepath
//       app.fonts (AE 24.0+) https://ae-scripting.docsforadobe.dev/text/fontsobject/
//       usedFonts (AE 24.5+) https://ae-scripting.docsforadobe.dev/general/project/#projectusedfonts
var out = { ok: false, mode: PARAMS.mode, step: 'init' };

function slashes(p) {
  return String(p).replace(/\\/g, '/');
}

function sameProject(cur, want) {
  if (cur === '' && PARAMS.converted) {
    // Untitled converted project that Node has just opened (AE 26.5): recognised by its fingerprint.
    var fp = PARAMS.converted;
    return app.project.numItems === fp.items && app.project.numItems > 0 && app.project.item(1).name === fp.first;
  }
  var a = slashes(cur).toLowerCase().replace(/ \(converted\)(\.aepx?)$/, '$1');
  return a === slashes(want).toLowerCase();
}

// File footage only: solids are skipped, placeholders are listed (AE counts them as missing).
function fileFootage() {
  var list = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (!(it instanceof FootageItem)) {
      continue;
    }
    var src = it.mainSource;
    var placeholder = src instanceof PlaceholderSource;
    if (!placeholder && !(src instanceof FileSource)) {
      continue;
    }
    var row = { id: it.id, name: it.name, missing: it.footageMissing, placeholder: placeholder, path: null };
    if (!placeholder) {
      if (it.footageMissing) {
        row.path = src.missingFootagePath;
      } else if (it.file) {
        row.path = it.file.fsName;
      }
    }
    list.push(row);
  }
  return list;
}

function fontRow(f) {
  return {
    postScriptName: f.postScriptName,
    familyName: f.familyName,
    styleName: f.styleName,
    version: f.version,
    location: f.location,
    isSubstitute: f.isSubstitute
  };
}

function fontReport() {
  var r = { missingOrSubstituted: [], used: [] };
  var i;
  if (app.fonts && app.fonts.missingOrSubstitutedFonts) {
    var ms = app.fonts.missingOrSubstitutedFonts;
    for (i = 0; i < ms.length; i++) {
      r.missingOrSubstituted.push(fontRow(ms[i]));
    }
  }
  var used = app.project.usedFonts;
  if (used) {
    for (i = 0; i < used.length; i++) {
      var row = fontRow(used[i].font);
      row.uses = used[i].usedAt ? used[i].usedAt.length : 0;
      r.used.push(row);
    }
  }
  return r;
}

function replaceAll(jobs) {
  var done = [];
  app.beginUndoGroup('BK relink');
  try {
    for (var k = 0; k < jobs.length; k++) {
      var job = jobs[k];
      var rec = { id: job.id, before: job.name, ok: false };
      try {
        var item = app.project.itemByID(job.id);
        var nf = new File(job.path);
        if (!item || item.name !== job.name) {
          rec.error = 'ITEM_CHANGED';
        } else if (!nf.exists) {
          rec.error = 'NO_FILE';
        } else {
          item.replace(nf);
          rec.ok = !item.footageMissing;
          rec.after = item.name;
          rec.path = item.file ? item.file.fsName : null;
        }
      } catch (e1) {
        rec.error = 'EXC: ' + String(e1);
      }
      done.push(rec);
    }
  } finally {
    app.endUndoGroup();
  }
  return done;
}

function describeProject() {
  out.footage = fileFootage();
  out.fonts = fontReport();
  out.engine = app.project.expressionEngine;
  out.bitsPerChannel = app.project.bitsPerChannel;
  out.workingSpace = app.project.workingSpace;
  out.version = String(app.version);
}

try {
  out.step = 'check project';
  var cur = app.project.file ? app.project.file.fsName : '';
  out.file = cur;
  if (!sameProject(cur, PARAMS.expect)) {
    out.error = 'NOT_EXPECTED_PROJECT';
    out.detail = cur;
  } else if (PARAMS.mode === 'scan') {
    out.step = 'scan';
    out.footage = fileFootage();
    out.ok = true;
  } else if (PARAMS.mode === 'apply') {
    out.step = 'replace';
    out.replaced = replaceAll(PARAMS.replace);
    out.step = 'save';
    app.beginSuppressDialogs();
    try {
      app.project.save(new File(PARAMS.saveAs));
    } finally {
      app.endSuppressDialogs(false);
    }
    out.saved = app.project.file ? app.project.file.fsName : null;
    out.step = 'report';
    describeProject();
    out.ok = true;
  } else if (PARAMS.mode === 'report') {
    out.step = 'report';
    describeProject();
    out.ok = true;
  } else {
    out.error = 'BAD_MODE';
  }
} catch (e) {
  out.error = 'EXC';
  out.detail = String(e) + ' (line ' + e.line + ', step ' + out.step + ')';
}
JSON.stringify(out);
