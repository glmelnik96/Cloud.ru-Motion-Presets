// After Effects adapter of the BrandKit panel (ES3, ASCII only), plan 2026-10-05 task 7. The head is
// panel/host/common.jsx (CRBK.call, CRBK.ok, CRBK.fail, CRBK.error, CRBK._wrap); this part fills CRBK.fns:
//   getContext()             host, version, project, the active comp as the target, project colour and engine
//   insertItem(AeInsertArgs) one call, one undo step: the template imported once per id@version into the bin, a
//                            layer of the variant comp at the time, the fields written and read back, the length
//                            fitted by time remap (contract C27), the new layer selected
//   findPlaced(probe)        the layer a lost insertItem reply may have left: comp, source name, start time
//   checkFonts(psNames)      found, build and substitute per PostScript name, from app.fonts
//   diag()                   app, build, language, project, colour, expression engine and the bin
// Rules (spec 6.1 and 8.2):
// - The panel never opens, saves or closes a project, never makes a comp of its own and never acts on the first of
//   several matches: an item is found exactly once, or the call is refused with a code.
// - Nothing in the project changes before every check that can be made without changing it has passed. After that,
//   an exception takes the new layer out again (the bin and the imported folder stay: they are reused by the next
//   insert) and the undo group is closed anyway.
// - Refusals are CRBK.error(code) with the codes of panel/src/core/errors.ts; there is no Russian text here. A warning
//   is a short code in result.warnings: NO_ESSENTIAL_PROPERTIES, FIELD_NOT_FOUND, FIELD_AMBIGUOUS,
//   FIELD_TYPE_UNSUPPORTED, FIELD_VALUE_INVALID, FIELD_WRITE_FAILED, FIELD_READ_FAILED (each with ': <name>'),
//   LAYER_START_MISMATCH, TEMPLATE_DURATION_MISMATCH, REMAP_KEYS_MISMATCH, LENGTH_NOT_APPLIED, SELECTION_MISMATCH,
//   SELECTION_FAILED.
// - No lookup table is keyed by a name that comes from outside: AE 26.5 gives every object inherited '*', '+', '-'
//   and '/' members, so obj[key] finds a function for those keys. Properties are found by comparing their names.
// - Load-time code only defines functions (an uncaught error here would leave a modal alert in AE).
(function (CRBK) {
  CRBK.host = 'ae';

  var BIN = 'Cloud.ru BrandKit'; // the bin of imported templates, at the root of the project (spec 6.1, AE step 3)
  var T_EPS = 1e-6; // two times are one when they differ by less than a microsecond
  var V_EPS = 1e-3; // a time remap value is checked to a millisecond
  var WALK_LIMIT = 1000; // cap of a walk up parentFolder

  function str(v) {
    if (v === undefined || v === null) {
      return '';
    }
    try {
      return String(v);
    } catch (e) {
      return '';
    }
  }

  // A read that cannot throw: a missing property or an invalid host object gives undefined.
  function rd(o, k) {
    try {
      return o[k];
    } catch (e) {
      return undefined;
    }
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function num(v) {
    return isNum(v) ? v : 0;
  }

  function bad(what) {
    return CRBK.error('BAD_ARGS', what);
  }

  function needText(v, name) {
    if (typeof v !== 'string' || v === '') {
      throw bad(name);
    }
    return v;
  }

  function needNum(v, name) {
    if (!isNum(v)) {
      throw bad(name);
    }
    return v;
  }

  // Runs fn with script-error dialogs suppressed and always ends the suppression (spikes/lib/ae-project.jsx bkQuiet);
  // endSuppressDialogs(false) does not show what was suppressed afterwards.
  function quiet(fn) {
    app.beginSuppressDialogs();
    try {
      return fn();
    } finally {
      app.endSuppressDialogs(false);
    }
  }

  function endGroup() {
    try {
      app.endUndoGroup();
    } catch (e) {
      // nothing else can be done for a group AE will not close; the result of the call stands
    }
  }

  // Two host objects are the same item when their ids are: wrappers of one item are not always one object.
  function sameItem(a, b) {
    var x = rd(a, 'id');
    return x !== undefined && x === rd(b, 'id');
  }

  // True when `folder` is one of the parent folders of `item`, any number of levels up.
  function inside(item, folder) {
    var f = rd(item, 'parentFolder'), n = 0;
    while (f && n < WALK_LIMIT) {
      if (sameItem(f, folder)) {
        return true;
      }
      f = rd(f, 'parentFolder');
      n++;
    }
    return false;
  }

  // Every item under `folder`, at any depth, that passes test(item) (spikes/s3-instance/lib.jsx s3FindItems).
  function collect(folder, test) {
    var out = [], stack = [folder], f, it, i;
    while (stack.length) {
      f = stack.pop();
      for (i = 1; i <= f.numItems; i++) {
        it = f.item(i);
        if (it instanceof FolderItem) {
          stack.push(it);
        }
        if (test(it)) {
          out.push(it);
        }
      }
    }
    return out;
  }

  // The one item of the list; none gives null, several are refused: the panel never takes the first found.
  function exactlyOne(list, what) {
    if (list.length > 1) {
      throw CRBK.error('TEMPLATE_DUPLICATE', list.length + ' of ' + what);
    }
    return list.length ? list[0] : null;
  }

  // The folders named BIN at the root of the project.
  function findBins() {
    var root = app.project.rootFolder, out = [], i, it;
    for (i = 1; i <= root.numItems; i++) {
      it = root.item(i);
      if (it instanceof FolderItem && it.name === BIN) {
        out.push(it);
      }
    }
    return out;
  }

  function makeBin() {
    var bin = app.project.items.addFolder(BIN), bins = findBins();
    if (bins.length === 0) {
      // AE filed the new folder somewhere other than the root (a folder selected in the Project panel)
      bin.parentFolder = app.project.rootFolder;
      bins = findBins();
    }
    if (bins.length !== 1) {
      throw CRBK.error('INSERT_FAILED', 'the bin could not be made at the root of the project');
    }
    return bins[0];
  }

  function activeComp() {
    var a = rd(app.project, 'activeItem');
    return a instanceof CompItem ? a : null;
  }

  // Seconds in one frame of the comp (1/25 when AE says nothing usable).
  function frameSec(comp) {
    var fr = rd(comp, 'frameRate');
    return isNum(fr) && fr > 0 ? 1 / fr : 0.04;
  }

  // The comp with this id, found among all the items of the project: exactly one or none.
  function findCompById(id) {
    var proj = app.project, out = [], i, it;
    for (i = 1; i <= proj.numItems; i++) {
      it = proj.item(i);
      if (it instanceof CompItem && str(rd(it, 'id')) === id) {
        out.push(it);
      }
    }
    return exactlyOne(out, 'comps with id ' + id);
  }

  function isLabelled(key) {
    return function (it) {
      return it instanceof FolderItem && it.comment === key;
    };
  }

  // The one comp of this name in the template folder, however deep.
  function templateComp(folder, name) {
    var list = collect(folder, function (it) {
      return it instanceof CompItem && it.name === name;
    });
    if (!list.length) {
      throw CRBK.error('TEMPLATE_NOT_FOUND', name);
    }
    return exactlyOne(list, 'comps named ' + name);
  }

  // Imports the template .aep as a project (S3: one FolderItem named after the file on AE 26.5) and files it in the
  // bin under its id@version label. Dialogs are suppressed for the import only.
  function importTemplate(file, bin, key) {
    var io = new ImportOptions(file), item = null, filed = false;
    if (!io.canImportAs(ImportAsType.PROJECT)) {
      throw CRBK.error('INSERT_FAILED', 'the template cannot be imported as a project');
    }
    io.importAs = ImportAsType.PROJECT;
    try {
      item = quiet(function () {
        return app.project.importFile(io);
      });
    } catch (e) {
      throw CRBK.error('INSERT_FAILED', 'import: ' + str(e));
    }
    if (!(item instanceof FolderItem)) {
      throw CRBK.error('INSERT_FAILED', 'the import gave no folder');
    }
    try {
      item.parentFolder = bin;
      item.comment = key;
      filed = item.comment === key && sameItem(item.parentFolder, bin);
    } catch (e2) {
      filed = false;
    }
    if (!filed) {
      // A folder that is not in the bin under its label would be imported again by the next insert: take it out.
      try {
        item.remove();
      } catch (e3) {
        // the stray folder stays
      }
      throw CRBK.error('INSERT_FAILED', 'the imported folder could not be filed in the bin');
    }
    return item;
  }

  // ---- arguments -----------------------------------------------------------------------------------------------------

  function insertArgs(a) {
    var out = { fields: [] }, list, f, i;
    if (!a || typeof a !== 'object' || CRBK.isList(a)) {
      throw bad('arguments');
    }
    if (typeof a.compId !== 'string' && typeof a.compId !== 'number') {
      throw bad('compId');
    }
    out.compId = String(a.compId);
    out.aepPath = typeof a.aepPath === 'string' ? a.aepPath : '';
    // An empty key would match every folder that has no comment, so it is never accepted.
    out.itemKey = needText(a.itemKey, 'itemKey');
    out.aeComp = needText(a.aeComp, 'aeComp');
    out.timeSec = needNum(a.timeSec, 'timeSec');
    out.lenSec = needNum(a.lenSec, 'lenSec');
    out.durSec = needNum(a.durSec, 'durSec');
    out.inSec = needNum(a.inSec, 'inSec');
    out.outSec = needNum(a.outSec, 'outSec');
    if (out.lenSec <= 0 || out.durSec <= 0) {
      throw bad('lenSec and durSec must be above 0');
    }
    out.label = typeof a.label === 'string' && a.label !== '' ? a.label : BIN;
    list = a.fields === undefined || a.fields === null ? [] : a.fields;
    if (!CRBK.isList(list)) {
      throw bad('fields');
    }
    for (i = 0; i < list.length; i++) {
      f = list[i];
      if (!f || typeof f !== 'object' || typeof f.egpName !== 'string' || f.egpName === '' || typeof f.type !== 'string' ||
          (typeof f.value !== 'string' && typeof f.value !== 'number' && typeof f.value !== 'boolean')) {
        throw bad('fields[' + i + ']');
      }
      out.fields.push({ egpName: f.egpName, type: f.type, value: f.value });
    }
    return out;
  }

  // ---- fields (Essential Properties) ----------------------------------------------------------------------------------

  // The instance's Essential Properties group (spikes/s3-instance/lib.jsx s3EpGroup): layer.essentialProperty, else
  // the group of match name ADBE Layer Overrides. null when the layer has none.
  function epGroup(layer) {
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
    return g === undefined ? null : g;
  }

  // Every property named `name` under the group, depth first. The names are our own EGP names from the library, not
  // AE's localized UI names, so a lookup by name is safe (S3).
  function findEps(group, name, out) {
    var i, p;
    for (i = 1; i <= group.numProperties; i++) {
      p = group.property(i);
      if (p.propertyType === PropertyType.PROPERTY) {
        if (p.name === name) {
          out.push(p);
        }
      } else {
        findEps(p, name, out);
      }
    }
    return out;
  }

  // AE keeps the lines of a text apart with CR; a CRLF or LF in the written text is the same line break.
  function lines(s) {
    return String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function sameNumber(a, b) {
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  }

  // What the field should read back as: kind 'text' or 'number' with the value, or kind 'none' with the warning code
  // for a field that cannot be written (a media slot, a number that is none).
  function expectOf(w) {
    var n;
    if (w.type === 'text') {
      return { kind: 'text', value: String(w.value) };
    }
    if (w.type === 'dropdown' || w.type === 'checkbox' || w.type === 'slider') {
      n = typeof w.value === 'string' && w.value.replace(/\s/g, '') === '' ? NaN : Number(w.value);
      return isNum(n) ? { kind: 'number', value: n } : { kind: 'none', why: 'FIELD_VALUE_INVALID' };
    }
    return { kind: 'none', why: 'FIELD_TYPE_UNSUPPORTED' };
  }

  function settle(rec, back) {
    if (rec.ex.kind === 'text') {
      rec.res.back = typeof back === 'string' ? back : null;
      rec.res.ok = rec.res.back !== null && lines(rec.res.back) === lines(rec.ex.value);
    } else {
      rec.res.back = isNum(back) ? back : null;
      rec.res.ok = rec.res.back !== null && sameNumber(rec.res.back, rec.ex.value);
    }
  }

  // Writes one field and reads it back in the same call (S3: s3WriteText and s3WriteNumber without check()). A text
  // goes through its TextDocument; a dropdown is 1-based as in the library, a checkbox 0 or 1.
  function putField(group, rec, warnings) {
    var name = rec.w.egpName, found, p, doc, back;
    if (rec.ex.kind === 'none') {
      warnings.push(rec.ex.why + ': ' + name);
      return;
    }
    if (!group) {
      return;
    }
    try {
      found = findEps(group, name, []);
      if (found.length !== 1) {
        warnings.push((found.length ? 'FIELD_AMBIGUOUS: ' : 'FIELD_NOT_FOUND: ') + name);
        return;
      }
      p = found[0];
      if (rec.ex.kind === 'text') {
        doc = p.value;
        doc.text = rec.ex.value;
        p.setValue(doc);
        rec.wrote = true;
        back = p.value.text;
      } else {
        p.setValue(rec.ex.value);
        rec.wrote = true;
        back = Number(p.value);
      }
      settle(rec, back);
    } catch (e) {
      warnings.push('FIELD_WRITE_FAILED: ' + name + ': ' + str(e));
    }
  }

  // Reads a written field again from a group fetched anew (enabling time remap invalidates the objects taken before).
  function rereadField(group, rec, warnings) {
    var found, back;
    if (!rec.wrote) {
      return;
    }
    rec.res.back = null;
    rec.res.ok = false;
    try {
      found = group ? findEps(group, rec.w.egpName, []) : [];
      if (found.length !== 1) {
        warnings.push('FIELD_READ_FAILED: ' + rec.w.egpName + ': ' + (found.length ? 'ambiguous' : 'not found'));
        return;
      }
      back = rec.ex.kind === 'text' ? found[0].value.text : Number(found[0].value);
      settle(rec, back);
    } catch (e) {
      warnings.push('FIELD_READ_FAILED: ' + rec.w.egpName + ': ' + str(e));
    }
  }

  // ---- length (contract C27: time remap) ---------------------------------------------------------------------------

  // Keys [layer time, template time] that make the instance lenSec long: the intro and the outro play at template
  // speed, the hold takes up the change. Keys at one time are one key (setValueAtTime replaces a key at its time),
  // the later one wins. Port of remapKeys in spikes/s3-instance/analyze.mjs.
  function remapKeys(dur, inSec, outSec, len) {
    var raw = [[0, 0], [inSec, inSec], [len - (dur - outSec), outSec], [len, dur]], keys = [], i, k;
    for (i = 0; i < raw.length; i++) {
      k = [CRBK.round(raw[i][0], 6), CRBK.round(raw[i][1], 6)];
      if (keys.length && Math.abs(keys[keys.length - 1][0] - k[0]) < T_EPS) {
        keys[keys.length - 1] = k;
      } else {
        keys.push(k);
      }
    }
    return keys;
  }

  // null when the insert is as long as the template within half a frame of the comp (nothing to fit); else the keys.
  // Refuses a length with no hold left: the keys of the end of the intro and the start of the outro would share a
  // time, and AE would keep one of them.
  function fitKeys(a, half) {
    var hold;
    if (Math.abs(a.lenSec - a.durSec) <= half) {
      return null;
    }
    if (a.inSec < 0 || a.inSec > a.outSec || a.outSec > a.durSec) {
      throw bad('protected regions');
    }
    hold = a.lenSec - (a.durSec - a.outSec) - a.inSec;
    if (hold < T_EPS) {
      throw CRBK.error('LENGTH_TOO_SHORT', 'min ' + CRBK.round(a.inSec + (a.durSec - a.outSec), 6));
    }
    return remapKeys(a.durSec, a.inSec, a.outSec, a.lenSec);
  }

  function hasKey(list, t, v) {
    var i;
    for (i = 0; i < list.length; i++) {
      if (Math.abs(list[i][0] - t) < T_EPS && Math.abs(list[i][1] - v) < T_EPS) {
        return true;
      }
    }
    return false;
  }

  // The proven sequence (spikes/s3-instance/probe-6-remap.jsx): remap on (AE adds two keys of its own), THEN the out
  // point (enabling resets it, quirk #133), our keys, then AE's keys out from the last index down (removing every key
  // would turn remap off, so ours go in first), linear. AE's keys are told by what they were right after enabling,
  // not by time: with a key of AE a frame away from one of ours, only the record keeps the right one. Returns the keys
  // as they are on the layer, [layer time, template time].
  function fitLength(layer, keys, len, half, warnings) {
    var start = layer.startTime, tr, own = [], ours = [], rows = [], tol = half + T_EPS, ok, i, k, t, v;
    if (layer.canSetTimeRemapEnabled !== true) {
      throw CRBK.error('INSERT_FAILED', 'time remap is not available for the layer');
    }
    layer.timeRemapEnabled = true;
    if (layer.timeRemapEnabled !== true) {
      throw CRBK.error('INSERT_FAILED', 'time remap did not switch on');
    }
    layer.outPoint = start + len;
    tr = layer.property('ADBE Time Remapping');
    if (!tr) {
      throw CRBK.error('INSERT_FAILED', 'the layer has no time remap property');
    }
    for (k = 1; k <= tr.numKeys; k++) {
      own.push([tr.keyTime(k), Number(tr.keyValue(k))]);
    }
    for (i = 0; i < keys.length; i++) {
      ours.push([start + keys[i][0], keys[i][1]]);
      tr.setValueAtTime(start + keys[i][0], keys[i][1]);
    }
    for (k = tr.numKeys; k >= 1; k--) {
      t = tr.keyTime(k);
      v = Number(tr.keyValue(k));
      if (hasKey(own, t, v) && !hasKey(ours, t, v)) {
        tr.removeKey(k);
      }
    }
    for (k = 1; k <= tr.numKeys; k++) {
      tr.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
      rows.push([CRBK.round(tr.keyTime(k) - start, 6), CRBK.round(Number(tr.keyValue(k)), 6)]);
    }
    // AE may have rounded key times to the frame grid, which can bring two keys onto one frame: say so.
    ok = rows.length === keys.length;
    for (i = 0; ok && i < rows.length; i++) {
      ok = Math.abs(rows[i][0] - keys[i][0]) <= tol && Math.abs(rows[i][1] - keys[i][1]) <= V_EPS;
    }
    if (!ok) {
      warnings.push('REMAP_KEYS_MISMATCH');
    }
    if (layer.timeRemapEnabled !== true || Math.abs(layer.outPoint - (start + len)) > half) {
      warnings.push('LENGTH_NOT_APPLIED');
    }
    return rows;
  }

  // ---- the instance --------------------------------------------------------------------------------------------------

  function layerId(layer) {
    var id = rd(layer, 'id');
    return str(id !== undefined && id !== null ? id : rd(layer, 'index'));
  }

  function placedOf(layer) {
    return {
      kind: 'layer',
      id: layerId(layer),
      name: str(rd(layer, 'name')),
      startSec: CRBK.round(num(rd(layer, 'inPoint')), 6),
      endSec: CRBK.round(num(rd(layer, 'outPoint')), 6)
    };
  }

  // Only the new layer selected: the next step of the user (move it, edit it) acts on it and on nothing else.
  function selectOnly(comp, layer, warnings) {
    var sel, i;
    try {
      sel = comp.selectedLayers;
      for (i = 0; i < sel.length; i++) {
        sel[i].selected = false;
      }
      layer.selected = true;
      if (comp.selectedLayers.length !== 1) {
        warnings.push('SELECTION_MISMATCH');
      }
    } catch (e) {
      warnings.push('SELECTION_FAILED: ' + str(e));
    }
  }

  // The layer goes out again when a step after layers.add throws; a layer AE will not remove is left, and the
  // original error is the one that is reported.
  function discard(layer) {
    try {
      layer.remove();
    } catch (e) {
      // nothing more can be done
    }
  }

  // Inside the undo group: the layer, its start time, the fields, the length, the selection.
  function addInstance(a, comp, tpl, keys, half) {
    var layer = null, warnings = [], recs = [], result, group, rows = null, start, i;
    try {
      try {
        layer = comp.layers.add(tpl);
      } catch (e) {
        throw CRBK.error('INSERT_FAILED', 'layers.add: ' + str(e));
      }
      // layers.add follows the "create layers at composition start time" preference: the time is set explicitly.
      layer.startTime = a.timeSec;
      start = layer.startTime;
      if (!isNum(start) || Math.abs(start - a.timeSec) > half) {
        warnings.push('LAYER_START_MISMATCH');
      }
      if (Math.abs(num(rd(tpl, 'duration')) - a.durSec) > half) {
        warnings.push('TEMPLATE_DURATION_MISMATCH');
      }
      group = epGroup(layer);
      if (!group && a.fields.length) {
        warnings.push('NO_ESSENTIAL_PROPERTIES');
      }
      for (i = 0; i < a.fields.length; i++) {
        recs.push({
          w: a.fields[i],
          ex: expectOf(a.fields[i]),
          wrote: false,
          res: { egpName: a.fields[i].egpName, written: a.fields[i].value, back: null, ok: false }
        });
        putField(group, recs[i], warnings);
      }
      if (keys) {
        rows = fitLength(layer, keys, a.lenSec, half, warnings);
        group = epGroup(layer);
        for (i = 0; i < recs.length; i++) {
          rereadField(group, recs[i], warnings);
        }
      }
      selectOnly(comp, layer, warnings);
      result = { placed: placedOf(layer), fields: [], warnings: warnings };
      for (i = 0; i < recs.length; i++) {
        result.fields.push(recs[i].res);
      }
      if (rows) {
        result.remapKeys = rows;
      }
      return result;
    } catch (err) {
      if (layer) {
        discard(layer);
      }
      throw err;
    }
  }

  // ---- project context ------------------------------------------------------------------------------------------------

  function pathOf(proj) {
    var f = rd(proj, 'file'), p = f ? rd(f, 'fsName') : null;
    return typeof p === 'string' && p !== '' ? p : null;
  }

  // The colour settings of the project, or null when one of them cannot be read (unknown is not a default).
  function colourOf(proj) {
    var ws = rd(proj, 'workingSpace'), lin = rd(proj, 'linearizeWorkingSpace'), bpc = rd(proj, 'bitsPerChannel');
    if (ws === undefined || ws === null || lin === undefined || !isNum(bpc)) {
      return null;
    }
    return { workingSpace: str(ws), linearize: !!lin, bpc: bpc };
  }

  function engineOf(proj) {
    var e = rd(proj, 'expressionEngine');
    return e === undefined || e === null ? null : str(e);
  }

  CRBK.fns.getContext = function () {
    var proj = rd(app, 'project'), path = pathOf(proj), active = rd(proj, 'activeItem'), ctx, colour, engine;
    ctx = {
      host: 'ae',
      hostVersion: str(rd(app, 'version')),
      project: { path: path, saved: path !== null },
      target: null
    };
    if (active instanceof CompItem) {
      ctx.target = {
        kind: 'comp',
        id: str(rd(active, 'id')),
        name: str(rd(active, 'name')),
        w: num(rd(active, 'width')),
        h: num(rd(active, 'height')),
        fps: CRBK.round(num(rd(active, 'frameRate')), 3),
        timeSec: num(rd(active, 'time'))
      };
    }
    colour = colourOf(proj);
    if (colour) {
      ctx.colour = colour;
    }
    engine = engineOf(proj);
    if (engine !== null) {
      ctx.expressionEngine = engine;
    }
    return CRBK.ok(ctx);
  };

  CRBK.fns.insertItem = function (args) {
    var a = insertArgs(args), comp = activeComp(), half, bins, bin, folder = null, tpl = null, file = null, keys, i;
    if (!comp || str(rd(comp, 'id')) !== a.compId) {
      throw CRBK.error('TARGET_CHANGED', 'comp ' + a.compId + ' is not the active item');
    }
    half = frameSec(comp) / 2;
    // Every check that does not change the project comes first; a refusal then leaves it as it was.
    bins = findBins();
    for (i = 0; i < bins.length; i++) {
      // Inserting into a template comp, or into one that holds the template, would nest a comp into itself.
      if (sameItem(comp, bins[i]) || inside(comp, bins[i])) {
        throw CRBK.error('TARGET_IS_TEMPLATE', str(rd(comp, 'name')));
      }
    }
    bin = exactlyOne(bins, 'folders named ' + BIN);
    if (bin) {
      folder = exactlyOne(collect(bin, isLabelled(a.itemKey)), 'folders labelled ' + a.itemKey);
    }
    if (folder) {
      tpl = templateComp(folder, a.aeComp);
    } else {
      if (a.aepPath === '') {
        throw bad('aepPath');
      }
      file = new File(a.aepPath);
      if (!file.exists) {
        throw CRBK.error('FILE_MISSING', a.aepPath);
      }
    }
    keys = fitKeys(a, half);
    // One undo step for the whole insert: the bin, the import, the layer, the fields and the length.
    app.beginUndoGroup(a.label);
    try {
      if (!bin) {
        bin = makeBin();
      }
      if (!folder) {
        folder = importTemplate(file, bin, a.itemKey);
        tpl = templateComp(folder, a.aeComp);
      }
      return CRBK.ok(addInstance(a, comp, tpl, keys, half));
    } finally {
      endGroup();
    }
  };

  CRBK.fns.findPlaced = function (probe) {
    var comp, layer, src, half, i;
    if (!probe || typeof probe !== 'object' || CRBK.isList(probe)) {
      throw bad('probe');
    }
    if (probe.kind !== undefined && probe.kind !== 'layer') {
      throw bad('kind');
    }
    if (typeof probe.targetId !== 'string' && typeof probe.targetId !== 'number') {
      throw bad('targetId');
    }
    needText(probe.name, 'name');
    needNum(probe.startSec, 'startSec');
    comp = findCompById(String(probe.targetId));
    if (!comp) {
      return CRBK.ok(null);
    }
    half = frameSec(comp) / 2;
    // The lowest index is the newest layer: layers.add puts a layer on top.
    for (i = 1; i <= comp.numLayers; i++) {
      layer = comp.layer(i);
      src = rd(layer, 'source');
      if (src && rd(src, 'name') === probe.name && Math.abs(num(rd(layer, 'startTime')) - probe.startSec) <= half) {
        return CRBK.ok(placedOf(layer));
      }
    }
    return CRBK.ok(null);
  };

  // AE puts Times New Roman in for a font it cannot find, and says so in isSubstitute, or by the file it uses
  // (quirk #187). A request for Times New Roman itself is no substitute.
  function isSubstitute(f, ps) {
    if (rd(f, 'isSubstitute') === true) {
      return true;
    }
    return /times\.ttf$/i.test(str(rd(f, 'location'))) && !/^TimesNewRoman/i.test(ps);
  }

  // build is the version of the first font of that name that is not a substitute (tools/masters/jsx/build-spec.jsx).
  function fontStatus(fonts, ps) {
    var list = fonts.getFontsByPostScriptName(ps), good = null, subs = 0, v, i;
    for (i = 0; list && i < list.length; i++) {
      if (isSubstitute(list[i], ps)) {
        subs++;
      } else if (!good) {
        good = list[i];
      }
    }
    v = good ? rd(good, 'version') : null;
    return {
      postScriptName: ps,
      found: good !== null,
      build: v === undefined || v === null || v === '' ? null : str(v),
      substitute: good === null && subs > 0
    };
  }

  // args: the list of PostScript names, or { psNames: [...] }.
  CRBK.fns.checkFonts = function (args) {
    var names = null, fonts, out = [], i;
    if (CRBK.isList(args)) {
      names = args;
    } else if (args && typeof args === 'object' && CRBK.isList(args.psNames)) {
      names = args.psNames;
    }
    if (!names) {
      throw bad('psNames');
    }
    for (i = 0; i < names.length; i++) {
      if (typeof names[i] !== 'string') {
        throw bad('psNames[' + i + ']');
      }
    }
    fonts = rd(app, 'fonts');
    if (!fonts || typeof fonts.getFontsByPostScriptName !== 'function') {
      throw CRBK.error('FONTS_UNAVAILABLE', 'app.fonts is not available');
    }
    for (i = 0; i < names.length; i++) {
      out.push(fontStatus(fonts, names[i]));
    }
    return CRBK.ok(out);
  };

  CRBK.fns.diag = function () {
    var proj = rd(app, 'project'), bins = [], entries = [], i, j, kids, it, colour, engine, d;
    try {
      bins = findBins();
    } catch (e) {
      bins = [];
    }
    for (i = 0; i < bins.length; i++) {
      kids = rd(bins[i], 'numItems') || 0;
      for (j = 1; j <= kids; j++) {
        try {
          it = bins[i].item(j);
          entries.push({ name: str(rd(it, 'name')), comment: str(rd(it, 'comment')) });
        } catch (e2) {
          entries.push({ name: '', comment: '' });
        }
      }
    }
    d = {
      app: str(rd(app, 'version')),
      build: CRBK.build,
      language: str(rd(app, 'isoLanguage')),
      projectPath: pathOf(proj),
      dirty: rd(proj, 'dirty') === true,
      json: typeof JSON !== 'undefined' && /\[native code\]/.test(str(JSON.stringify)) ? 'native' : 'polyfill',
      bins: bins.length,
      bin: entries
    };
    colour = colourOf(proj);
    if (colour) {
      d.colour = colour;
    }
    engine = engineOf(proj);
    if (engine !== null) {
      d.expressionEngine = engine;
    }
    return CRBK.ok(d);
  };
})($.global.CRBK);
