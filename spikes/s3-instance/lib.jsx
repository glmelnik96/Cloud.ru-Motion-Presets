// S3 helpers (ES3). Concatenated after PARAMS and spikes/lib/check.jsx, before each S3 probe.
// Every probe defines a global DATA object and ends with finish(DATA).

function s3Round(v) {
  return Math.round(v * 1000) / 1000;
}

function s3Near(a, b) {
  return Math.abs(a - b) < 0.001;
}

// Paths compared with forward slashes, case-insensitively (NTFS and APFS ignore case by default).
function s3Norm(p) {
  return String(p).replace(/\\/g, '/').toLowerCase();
}

// Records why a probe stopped early; run.mjs stops the whole run when DATA.stopped is set.
function s3Stop(reason) {
  DATA.stopped = reason;
}

// Items under `folder` (recursive) named `name` (null = any name) for which test(item) is true.
// https://ae-scripting.docsforadobe.dev/item/folderitem/
function s3FindItems(folder, name, test) {
  var out = [];
  var stack = [folder];
  var f, it, i;
  while (stack.length) {
    f = stack.pop();
    for (i = 1; i <= f.numItems; i++) {
      it = f.item(i);
      if (it instanceof FolderItem) {
        stack.push(it);
      }
      if ((name === null || it.name === name) && test(it)) {
        out.push(it);
      }
    }
  }
  return out;
}

function s3IsComp(it) {
  return it instanceof CompItem;
}

// Footage backed by a file; solids and placeholders have file === null.
// https://ae-scripting.docsforadobe.dev/item/footageitem/
function s3IsFileFootage(it) {
  return (it instanceof FootageItem) && it.file !== null;
}

// PropertyValueType enum -> its name (https://ae-scripting.docsforadobe.dev/property/property/).
function s3ValueTypeName(t) {
  var names = ['NO_VALUE', 'ThreeD_SPATIAL', 'ThreeD', 'TwoD_SPATIAL', 'TwoD', 'OneD', 'COLOR',
    'CUSTOM_VALUE', 'MARKER', 'LAYER_INDEX', 'MASK_INDEX', 'SHAPE', 'TEXT_DOCUMENT'];
  var i;
  for (i = 0; i < names.length; i++) {
    if (PropertyValueType[names[i]] === t) {
      return names[i];
    }
  }
  return String(t);
}

// The instance's Essential Properties group. layer.essentialProperty is used by the docs example
// for Property.essentialPropertySource (https://ae-scripting.docsforadobe.dev/property/property/);
// the group's match name ADBE Layer Overrides is listed in
// https://ae-scripting.docsforadobe.dev/matchnames/layer/avlayer/
function s3EpGroup(layer) {
  var g = null;
  try {
    g = layer.essentialProperty;
  } catch (e) {
    g = null;
  }
  if (g === undefined || g === null) {
    try {
      g = layer.property('ADBE Layer Overrides');
    } catch (e2) {
      g = null;
    }
  }
  return g;
}

// Depth-first search by display name. These names come from S1 (our Russian EGP names),
// not from AE's localized UI, so a name lookup is safe here.
function s3FindEp(group, name) {
  var i, p, q;
  for (i = 1; i <= group.numProperties; i++) {
    p = group.property(i);
    if (p.name === name) {
      return p;
    }
    if (p.propertyType !== PropertyType.PROPERTY) {
      q = s3FindEp(p, name);
      if (q) {
        return q;
      }
    }
  }
  return null;
}

// The template property behind an Essential Property (Property.essentialPropertySource, AE 22.0+):
// a Property, an AVLayer (media replacement) or null.
function s3EpSource(p) {
  var src = p.essentialPropertySource;
  var layer;
  if (src === null || src === undefined) {
    return { kind: 'none' };
  }
  if (src instanceof AVLayer) {
    return { kind: 'layer', layer: src.name };
  }
  layer = src.propertyGroup(src.propertyDepth);
  return {
    kind: 'property',
    matchName: src.matchName,
    group: src.parentProperty ? src.parentProperty.name : '',
    layer: layer ? layer.name : ''
  };
}

// One row per Essential Property: index path, name, value type, media replacement, source.
// This is what library.json needs for egpName / egpIndex (spec §4.4).
function s3ListEp(group, prefix, out) {
  var i, p, row;
  for (i = 1; i <= group.numProperties; i++) {
    p = group.property(i);
    row = { path: prefix + i, name: p.name, matchName: p.matchName, type: 'GROUP', media: false, source: null };
    if (p.propertyType === PropertyType.PROPERTY) {
      row.type = s3ValueTypeName(p.propertyValueType);
      try {
        row.media = p.canSetAlternateSource === true;
      } catch (e1) {
        row.media = 'EXC: ' + String(e1);
      }
      try {
        row.source = s3EpSource(p);
      } catch (e2) {
        row.source = 'EXC: ' + String(e2);
      }
      out.push(row);
    } else {
      out.push(row);
      s3ListEp(p, prefix + i + '.', out);
    }
  }
  return out;
}

// Writes a Source Text Essential Property and reads it back (AE 25.2+ reads overrides correctly).
// Undo groups nest (https://ae-scripting.docsforadobe.dev/general/application/), so the helper
// keeps its own group even when the probe already opened one. The check is required unless
// `required` is false (the time-remap probe writes its fields as information).
function s3WriteText(group, key, text, label, required) {
  return check(label, function () {
    var p = s3FindEp(group, PARAMS.egp[key]);
    var doc, back;
    if (!p) {
      return { pass: false, detail: 'no Essential Property named ' + PARAMS.egp[key] };
    }
    app.beginUndoGroup('BK S3 text field');
    try {
      doc = p.value;
      doc.text = text;
      p.setValue(doc);
    } finally {
      app.endUndoGroup();
    }
    back = p.value.text;
    return { pass: back === text, detail: { back: back } };
  }, required !== false);
}

// Writes a checkbox, slider or dropdown Essential Property and reads it back; `required` as in s3WriteText.
function s3WriteNumber(group, key, v, label, required) {
  return check(label, function () {
    var p = s3FindEp(group, PARAMS.egp[key]);
    var before, back;
    if (!p) {
      return { pass: false, detail: 'no Essential Property named ' + PARAMS.egp[key] };
    }
    before = p.value;
    app.beginUndoGroup('BK S3 field');
    try {
      p.setValue(v);
    } finally {
      app.endUndoGroup();
    }
    back = p.value;
    return {
      pass: Number(back) === Number(v),
      detail: { before: Number(before), back: Number(back), type: s3ValueTypeName(p.propertyValueType) }
    };
  }, required !== false);
}

// One whole frame of `comp` into `path`. CompItem.saveFrameToPng is not in the docsforadobe guide;
// it is live-verified on AE 26.x (ae-quirks #27, #34, #40, #50, #93): it honours resolutionFactor
// and returns before the file is on disk, so Node waits for a complete PNG (read-png.mjs waitForPng).
// Probes end with their renders: nothing in the comp changes until Node has the files.
function s3SaveFrame(comp, frame, path) {
  comp.resolutionFactor = [1, 1];
  comp.saveFrameToPng(frame * comp.frameDuration, new File(path));
  return path;
}

// Saves the project (to `path` when given) with dialogs suppressed; returns the saved path.
// https://ae-scripting.docsforadobe.dev/general/project/ (save with a File does not prompt)
function s3Save(path) {
  app.beginSuppressDialogs();
  try {
    if (path) {
      app.project.save(new File(path));
    } else {
      app.project.save();
    }
  } finally {
    app.endSuppressDialogs(false);
  }
  return app.project.file ? app.project.file.fsName : '';
}

// Project colour settings (https://ae-scripting.docsforadobe.dev/general/project/).
function s3ColorSettings() {
  var p = app.project;
  return {
    workingSpace: String(p.workingSpace),
    linearize: p.linearizeWorkingSpace,
    linearBlending: p.linearBlending,
    bpc: p.bitsPerChannel,
    gamma: p.workingGamma,
    engine: String(p.expressionEngine)
  };
}

// Imports the template .aep as a project (one folder per import).
// https://ae-scripting.docsforadobe.dev/other/importoptions/
function s3ImportTemplate(file) {
  var io = new ImportOptions(new File(file));
  var asProject = io.canImportAs(ImportAsType.PROJECT);
  var item = null;
  if (asProject) {
    io.importAs = ImportAsType.PROJECT;
  }
  app.beginSuppressDialogs();
  try {
    item = app.project.importFile(io);
  } finally {
    app.endSuppressDialogs(false);
  }
  return { item: item, asProject: asProject };
}

// Expression errors in a comp, read before any render: an expression that throws while
// saveFrameToPng renders can raise a blocking modal (ae-quirks #11). Best effort: expressionError
// holds the result of the last evaluation (https://ae-scripting.docsforadobe.dev/property/property/).
var S3_EXPR_GROUPS = ['ADBE Transform Group', 'ADBE Root Vectors Group', 'ADBE Effect Parade',
  'ADBE Text Properties', 'ADBE Mask Parade'];

function s3ExprWalk(group, where, out) {
  var i, p;
  for (i = 1; i <= group.numProperties; i++) {
    p = group.property(i);
    if (!p) {
      continue;
    }
    if (p.propertyType === PropertyType.PROPERTY) {
      try {
        if (p.canSetExpression && p.expressionEnabled && p.expressionError !== '') {
          out.push(where + '/' + p.matchName + ': ' + p.expressionError);
        }
      } catch (e) {
        // a property that cannot carry an expression: nothing to report
      }
    } else {
      s3ExprWalk(p, where, out);
    }
  }
}

function s3ExprErrors(comp) {
  var out = [];
  var i, j, layer, g;
  for (i = 1; i <= comp.numLayers; i++) {
    layer = comp.layer(i);
    for (j = 0; j < S3_EXPR_GROUPS.length; j++) {
      g = layer.property(S3_EXPR_GROUPS[j]);
      if (g) {
        s3ExprWalk(g, comp.name + '/' + layer.name, out);
      }
    }
  }
  return out;
}
