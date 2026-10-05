// BrandKit adapter for After Effects (ExtendScript, ES3). Spec 6.1 «After Effects»; the calls repeat what
// spike S3 proved on AE 26.5 (spikes/s3-instance): import of the template .aep as a project, the instance
// as a layer, Essential Properties by display name, setAlternateSource, time remap for the length (C27).
// Docs: https://ae-scripting.docsforadobe.dev/ (Project, ImportOptions, FolderItem, CompItem, AVLayer,
// Property; FontsObject 24.0+, layerByID 22.0+, essentialProperty / alternate sources 18.0+).
(function () {
  var A = {};

  function fail(code, msg, detail) {
    return BK.fail(code, msg, detail);
  }

  function near(a, b, eps) {
    return Math.abs(Number(a) - Number(b)) < (eps || 0.0005);
  }

  function activeComp() {
    var c = app.project.activeItem;
    return (c && c instanceof CompItem) ? c : null;
  }

  // The comp the plan was made for, and still the active one: never act on another comp (spec 8.2).
  function targetComp(targetId) {
    var c = activeComp();
    if (!c) {
      throw fail('NO_TARGET', 'no active composition');
    }
    if (targetId !== undefined && targetId !== null && String(c.id) !== String(targetId)) {
      throw fail('NO_TARGET', 'the active composition changed');
    }
    return c;
  }

  function colorSettings() {
    var p = app.project;
    var out = { workingSpace: '', linearize: false, bpc: 8, colorManagement: 'adobe', engine: '' };
    try { out.workingSpace = String(p.workingSpace); } catch (e1) { out.workingSpace = ''; }
    try { out.linearize = p.linearizeWorkingSpace === true; } catch (e2) { out.linearize = false; }
    try { out.bpc = Number(p.bitsPerChannel); } catch (e3) { out.bpc = 8; }
    try { out.engine = String(p.expressionEngine); } catch (e4) { out.engine = ''; }
    // Project.colorManagementSystem (AE 24.0+): ColorManagementSystem.ADOBE or .OCIO.
    try {
      if (typeof ColorManagementSystem !== 'undefined' && p.colorManagementSystem === ColorManagementSystem.OCIO) {
        out.colorManagement = 'ocio';
      }
    } catch (e5) {
      out.colorManagement = 'adobe';
    }
    return out;
  }

  A.ping = function () {
    return { app: 'ae', version: String(app.version), bk: BK.version };
  };

  A.getContext = function () {
    var c = activeComp();
    var proj = app.project;
    var path = proj.file ? BK.slash(proj.file.fsName) : null;
    return {
      host: 'ae',
      version: String(app.version),
      project: { saved: path !== null, path: path },
      target: c ? {
        kind: 'comp',
        id: String(c.id),
        name: String(c.name),
        w: c.width,
        h: c.height,
        fps: BK.round(c.frameRate),
        timeSec: BK.round(c.time),
        durationSec: BK.round(c.duration),
        rangeEndSec: BK.round(c.workAreaStart + c.workAreaDuration)
      } : null,
      selection: c ? c.selectedLayers.length : 0,
      color: colorSettings()
    };
  };

  // { names: [PostScript names] } -> { name: { found, version, substitute, location } } (AE 24.0+).
  A.checkFonts = function (args) {
    var out = {};
    var names = (args && args.names) || [];
    var i, list, f;
    for (i = 0; i < names.length; i++) {
      list = null;
      try { list = app.fonts.getFontsByPostScriptName(names[i]); } catch (e) { list = null; }
      f = (list && list.length) ? list[0] : null;
      out[names[i]] = {
        found: f !== null,
        version: f ? String(f.version) : null,
        substitute: f ? f.isSubstitute === true : false,
        location: f ? BK.slash(f.location) : null
      };
    }
    return out;
  };

  // ---- Project items ----

  function childFolder(parent, name) {
    var i, it;
    for (i = 1; i <= parent.numItems; i++) {
      it = parent.item(i);
      if (it instanceof FolderItem && it.name === name) {
        return it;
      }
    }
    return null;
  }

  function ensureBin(name) {
    var root = app.project.rootFolder;
    var bin = childFolder(root, name);
    if (!bin) {
      bin = app.project.items.addFolder(name);
      bin.parentFolder = root;
    }
    return bin;
  }

  function tagOf(key) {
    return 'BrandKit ' + key;
  }

  // The folder of an imported template: one per id@version, its comment carries the key (spec 6.1 step 3).
  function findImported(bin, key) {
    var i, it;
    for (i = 1; i <= bin.numItems; i++) {
      it = bin.item(i);
      if (it instanceof FolderItem && it.comment === tagOf(key)) {
        return it;
      }
    }
    return null;
  }

  function walk(folder, visit) {
    var stack = [folder];
    var f, i, it;
    while (stack.length) {
      f = stack.pop();
      for (i = 1; i <= f.numItems; i++) {
        it = f.item(i);
        visit(it);
        if (it instanceof FolderItem) {
          stack.push(it);
        }
      }
    }
  }

  function compsNamed(folder, name) {
    var out = [];
    walk(folder, function (it) {
      if (it instanceof CompItem && it.name === name) {
        out.push(it);
      }
    });
    return out;
  }

  function importAep(path) {
    var f = new File(path);
    var io, item;
    if (!f.exists) {
      throw fail('NO_FILE', 'нет файла библиотеки ' + path);
    }
    io = new ImportOptions(f);
    if (!io.canImportAs(ImportAsType.PROJECT)) {
      throw fail('TEMPLATE_BROKEN', 'файл не импортируется как проект: ' + path);
    }
    io.importAs = ImportAsType.PROJECT;
    app.beginSuppressDialogs();
    try {
      item = app.project.importFile(io);
    } finally {
      app.endSuppressDialogs(false);
    }
    if (!(item instanceof FolderItem)) {
      throw fail('TEMPLATE_BROKEN', 'импорт шаблона не дал папку проекта');
    }
    return item;
  }

  // Footage of the template is copied next to the user project and relinked there, so the project opens on
  // another machine (spec 6.1 «Переносимость»). Only files that live in the library are moved.
  function localizeFootage(folder, libraryRoot, assetDir) {
    var moved = [];
    var root = String(BK.slash(libraryRoot)).toLowerCase() + '/';
    walk(folder, function (it) {
      var src, dst, path;
      if (!(it instanceof FootageItem) || !it.file) {
        return;
      }
      path = BK.slash(it.file.fsName);
      if (String(path).toLowerCase().substr(0, root.length) !== root) {
        return;
      }
      BK.mkdirs(assetDir);
      src = new File(path);
      dst = new File(assetDir + '/' + src.name);
      if (!dst.exists && !src.copy(dst)) {
        throw fail('INSERT_FAILED', 'не скопировался файл шаблона ' + src.name);
      }
      it.replace(dst);
      moved.push(src.name);
    });
    return moved;
  }

  // ---- Essential Properties ----

  function epGroup(layer) {
    var g = null;
    try { g = layer.essentialProperty; } catch (e) { g = null; }
    if (g === undefined || g === null) {
      try { g = layer.property('ADBE Layer Overrides'); } catch (e2) { g = null; }
    }
    return g;
  }

  // Depth-first by display name: the names are our Russian Essential Graphics names, not AE UI strings.
  function findEp(group, name) {
    var i, p, q;
    if (!group) {
      return null;
    }
    for (i = 1; i <= group.numProperties; i++) {
      p = group.property(i);
      if (p.name === name) {
        return p;
      }
      if (p.propertyType !== PropertyType.PROPERTY) {
        q = findEp(p, name);
        if (q) {
          return q;
        }
      }
    }
    return null;
  }

  function footageFor(path) {
    var found = null;
    var item;
    walk(app.project.rootFolder, function (it) {
      if (!found && it instanceof FootageItem && it.file && BK.samePath(it.file.fsName, path)) {
        found = it;
      }
    });
    if (found) {
      return found;
    }
    if (!new File(path).exists) {
      throw fail('NO_FILE', 'нет файла ' + path);
    }
    item = app.project.importFile(new ImportOptions(new File(path)));
    return item;
  }

  function writeEp(group, w) {
    var p = findEp(group, w.egpName);
    var doc;
    if (!p) {
      return false;
    }
    if (w.type === 'text') {
      doc = p.value;
      doc.text = String(w.value);
      p.setValue(doc);
    } else if (w.type === 'media') {
      if (p.canSetAlternateSource !== true) {
        return false;
      }
      p.setAlternateSource(footageFor(String(w.value)));
    } else {
      p.setValue(Number(w.value));
    }
    return true;
  }

  function readEp(group, name, type) {
    var p = findEp(group, name);
    var v;
    if (!p) {
      return null;
    }
    if (type === 'media') {
      v = p.alternateSource;
      return v ? String(v.name) : null;
    }
    v = p.value;
    if (type === 'text') {
      return v && v.text !== undefined ? String(v.text) : String(v);
    }
    return Number(v);
  }

  // ---- Length (contract C27) ----

  // rdt: time remap with keys layer time -> template time, linear; the keys AE adds itself are removed
  // after ours are in (removing all of them switches time remap off: S3, AE 26.5).
  function applyRemap(layer, keys, lengthSec) {
    var tr, i, k, t, mine;
    if (layer.canSetTimeRemapEnabled !== true) {
      throw fail('INSERT_FAILED', 'у слоя нельзя включить time remap');
    }
    layer.timeRemapEnabled = true;
    layer.outPoint = layer.startTime + lengthSec;
    tr = layer.property('ADBE Time Remapping');
    for (i = 0; i < keys.length; i++) {
      tr.setValueAtTime(layer.startTime + keys[i][0], keys[i][1]);
    }
    for (k = tr.numKeys; k >= 1; k--) {
      t = tr.keyTime(k) - layer.startTime;
      mine = false;
      for (i = 0; i < keys.length; i++) {
        if (near(t, keys[i][0])) {
          mine = true;
        }
      }
      if (!mine) {
        tr.removeKey(k);
      }
    }
    for (k = 1; k <= tr.numKeys; k++) {
      tr.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
    }
    return tr.numKeys;
  }

  function scaleLayer(layer, s) {
    var sc = layer.property('ADBE Transform Group').property('ADBE Scale');
    var v = sc.value;
    var out = [];
    var i;
    for (i = 0; i < v.length; i++) {
      out.push(v[i] * s);
    }
    sc.setValue(out);
  }

  function selectOnly(comp, layer) {
    var sel = comp.selectedLayers;
    var i;
    for (i = 0; i < sel.length; i++) {
      sel[i].selected = false;
    }
    layer.selected = true;
  }

  // ---- Media: T2/T3 files and the companions of a template (spec 6.1, panel/src/core/media.ts) ----

  // A footage item of the file in the BrandKit folder, imported once: the same file is reused.
  function mediaFootage(bin, path, stats) {
    var i, it, f, item;
    for (i = 1; i <= bin.numItems; i++) {
      it = bin.item(i);
      if (it instanceof FootageItem && it.file && BK.samePath(it.file.fsName, path)) {
        return it;
      }
    }
    f = new File(path);
    if (!f.exists) {
      throw fail('NO_FILE', 'нет файла ' + path);
    }
    item = app.project.importFile(new ImportOptions(f));
    item.parentFolder = bin;
    stats.imported += 1;
    return item;
  }

  function isStill(footage) {
    try { return footage.mainSource.isStill === true; } catch (e) { return false; }
  }

  // Length of one pass of the file: Interpret Footage > Loop multiplies the duration of the item.
  function naturalSec(footage) {
    var loops = 1;
    if (isStill(footage)) {
      return null;
    }
    try { loops = Math.max(1, Number(footage.mainSource.loop) || 1); } catch (e) { loops = 1; }
    return footage.duration / loops;
  }

  // A loop: Interpret Footage > Loop up to the length (spec 6.1 «Петли T2»); never fewer loops than the item
  // already has, another insert may use them.
  function loopFootage(footage, natural, len) {
    var need = Math.ceil(len / natural - 0.000001);
    if (need > 1 && Number(footage.mainSource.loop) < need) {
      footage.mainSource.loop = need;
    }
  }

  // Imports every file of a layout before the undo group opens. A footage import inside beginUndoGroup /
  // endUndoGroup left After Effects 26.5 with «Undo group mismatch, will attempt to fix» on Ctrl+Z, and the
  // undo took back only the last move (build PC, 2026-10-05: the lower third with companions, imported for
  // the first time); the same insert with the files already in the bin undid cleanly. Imports stay in the
  // project like Premiere's; the undo group holds the layers only.
  function importLayout(bin, layout, stats) {
    var i;
    for (i = 0; i < layout.video.length; i++) {
      mediaFootage(bin, layout.video[i].file, stats);
    }
    for (i = 0; i < layout.audio.length; i++) {
      mediaFootage(bin, layout.audio[i].file, stats);
    }
  }

  function placed(role, layer) {
    return { role: role, name: String(layer.name), layerId: layer.id, startSec: BK.round(layer.inPoint), lengthSec: BK.round(layer.outPoint - layer.inPoint) };
  }

  // Layers of a layout: the video pieces, the backdrop solid under them, the sounds. Each new layer goes right
  // under `anchor` (the template layer for companions); without one the first layer stays on top.
  function placeLayout(comp, bin, layout, anchor, stats) {
    var out = [];
    var i, p, footage, natural, at, layer, b, first;
    first = null;
    function stack(l) {
      if (anchor) {
        l.moveAfter(anchor);
      }
      anchor = l;
      if (!first) {
        first = l;
      }
    }
    for (i = 0; i < layout.video.length; i++) {
      p = layout.video[i];
      footage = mediaFootage(bin, p.file, stats);
      natural = naturalSec(footage);
      at = BK.resolvePiece(p, natural);
      if (p.periodSec && natural) {
        loopFootage(footage, natural, at.len);
      }
      layer = comp.layers.add(footage);
      layer.startTime = at.start;
      layer.outPoint = at.start + at.len;
      if (layout.scale && !near(layout.scale, 1, 0.000001)) {
        scaleLayer(layer, layout.scale);
      }
      stack(layer);
      out.push(placed(p.role, layer));
    }
    if (layout.backdrop) {
      b = layout.backdrop;
      layer = comp.layers.addSolid([b.color[0] / 255, b.color[1] / 255, b.color[2] / 255], 'BrandKit #222222', comp.width, comp.height, comp.pixelAspect, b.lengthSec);
      layer.startTime = b.startSec;
      layer.outPoint = b.startSec + b.lengthSec;
      stack(layer);
      out.push(placed('backdrop', layer));
    }
    for (i = 0; i < layout.audio.length; i++) {
      p = layout.audio[i];
      footage = mediaFootage(bin, p.file, stats);
      at = BK.resolvePiece(p, naturalSec(footage));
      layer = comp.layers.add(footage);
      layer.startTime = at.start;
      layer.outPoint = at.start + at.len;
      stack(layer);
      out.push(placed(p.role, layer));
    }
    return { placed: out, first: first };
  }

  // ---- Effects: a brand .ffx on the selected layers (spec 6.1 step 7; S4 on AE 26.5) ----

  function sub(layer, name) {
    var g = null;
    try { g = layer.property(name); } catch (e) { g = null; }
    return g;
  }

  // Keys under a property group, and the earliest of them (layer time), a few levels deep.
  function keysUnder(group, depth, acc) {
    var i, p;
    if (!group || depth > 6) {
      return acc;
    }
    for (i = 1; i <= group.numProperties; i++) {
      p = null;
      try { p = group.property(i); } catch (e) { p = null; }
      if (!p) {
        continue;
      }
      if (p.propertyType === PropertyType.PROPERTY) {
        if (p.numKeys > 0) {
          acc.keys += p.numKeys;
          if (acc.first === null || p.keyTime(1) < acc.first) {
            acc.first = p.keyTime(1);
          }
        }
      } else {
        keysUnder(p, depth + 1, acc);
      }
    }
    return acc;
  }

  // What a preset may change on a layer: effects, text animators, their keys and the transform keys.
  function presetMark(layer) {
    var fx = sub(layer, 'ADBE Effect Parade');
    var text = sub(layer, 'ADBE Text Properties');
    var anim = text ? sub(text, 'ADBE Text Animators') : null;
    var acc = { keys: 0, first: null };
    keysUnder(fx, 0, acc);
    keysUnder(anim, 0, acc);
    keysUnder(sub(layer, 'ADBE Transform Group'), 0, acc);
    return { effects: fx ? fx.numProperties : 0, animators: anim ? anim.numProperties : 0, keys: acc.keys, first: acc.first };
  }

  // applyPreset acts on every selected layer of the comp, so it is called once; with nothing selected AE
  // would make a new solid, so a call without a selection is refused. One undo group; script dialogs are
  // suppressed around it, not inside it.
  A.applyPreset = function (req) {
    var comp = targetComp(req.targetId);
    var sel = comp.selectedLayers;
    var f = new File(req.file);
    var known = {};
    var before = [];
    var out = { layers: [], newLayers: [] };
    var i, l, m, b;
    if (!sel.length) {
      throw fail('NO_SELECTION', 'no layer selected');
    }
    if (!f.exists) {
      throw fail('NO_FILE', 'нет файла пресета ' + req.file);
    }
    for (i = 1; i <= comp.numLayers; i++) {
      known['id' + comp.layer(i).id] = true;
    }
    for (i = 0; i < sel.length; i++) {
      before.push({ layer: sel[i], mark: presetMark(sel[i]) });
    }
    app.beginSuppressDialogs();
    try {
      app.beginUndoGroup(req.undoLabel || 'BrandKit');
      try {
        sel[0].applyPreset(f);
      } finally {
        app.endUndoGroup();
      }
    } finally {
      app.endSuppressDialogs(false);
    }
    for (i = 0; i < before.length; i++) {
      l = before[i].layer;
      b = before[i].mark;
      m = presetMark(l);
      out.layers.push({
        name: String(l.name),
        layerId: l.id,
        changed: m.effects !== b.effects || m.animators !== b.animators || m.keys !== b.keys,
        firstKeySec: m.first === null ? null : BK.round(m.first)
      });
    }
    for (i = 1; i <= comp.numLayers; i++) {
      if (known['id' + comp.layer(i).id] !== true) {
        out.newLayers.push(String(comp.layer(i).name));
      }
    }
    return out;
  };

  // ---- Colours: a brand token onto the fill, the stroke or the text of the selected layers (spec 7, D23) ----

  // Leaf properties with this match name under a group, with the names of the groups above them.
  function propsByMatch(group, matchName, path, out, depth) {
    var i, p;
    if (!group || depth > 12) {
      return out;
    }
    for (i = 1; i <= group.numProperties; i++) {
      p = null;
      try { p = group.property(i); } catch (e) { p = null; }
      if (!p) {
        continue;
      }
      if (p.propertyType === PropertyType.PROPERTY) {
        if (p.matchName === matchName) {
          out.push({ prop: p, path: path });
        }
      } else {
        propsByMatch(p, matchName, path ? path + ' / ' + p.name : String(p.name), out, depth + 1);
      }
    }
    return out;
  }

  function driven(p) {
    var on = false;
    try { on = p.expressionEnabled === true && String(p.expression) !== ''; } catch (e) { on = false; }
    return on;
  }

  // A value now, or a key at the current time when the property is animated.
  function setNow(p, value, t, rec) {
    if (p.numKeys > 0) {
      p.setValueAtTime(t, value);
      rec.keyed += 1;
    } else {
      p.setValue(value);
    }
    rec.set += 1;
  }

  function isSolid(layer) {
    var ms = null;
    try { ms = layer.source ? layer.source.mainSource : null; } catch (e) { ms = null; }
    return !!ms && typeof SolidSource !== 'undefined' && ms instanceof SolidSource;
  }

  function colorLayer(layer, req, t) {
    var rec = { name: String(layer.name), set: 0, keyed: 0, expressions: [] };
    var match, list, i, src, doc, text;
    if (req.target === 'fill' || req.target === 'stroke') {
      match = req.target === 'fill' ? 'ADBE Vector Fill Color' : 'ADBE Vector Stroke Color';
      list = propsByMatch(sub(layer, 'ADBE Root Vectors Group'), match, '', [], 0);
      for (i = 0; i < list.length; i++) {
        if (driven(list[i].prop)) {
          rec.expressions.push(list[i].path + ' / ' + list[i].prop.name);
        } else {
          setNow(list[i].prop, req.rgb, t, rec);
        }
      }
      // A solid's colour lives in its source, as in Solid Settings.
      if (req.target === 'fill' && isSolid(layer)) {
        layer.source.mainSource.color = req.rgb;
        rec.set += 1;
        rec.solid = true;
      }
    } else {
      text = sub(layer, 'ADBE Text Properties');
      src = text ? sub(text, 'ADBE Text Document') : null;
      if (src && driven(src)) {
        rec.expressions.push(String(src.name));
      } else if (src) {
        doc = src.numKeys > 0 ? src.valueAtTime(t, false) : src.value;
        doc.applyFill = true;
        doc.fillColor = req.rgb;
        setNow(src, doc, t, rec);
      }
    }
    return rec;
  }

  // One undo group for all selected layers; script dialogs suppressed around it.
  A.applyColor = function (req) {
    var comp = targetComp(req.targetId);
    var sel = comp.selectedLayers;
    var out = { layers: [] };
    var i;
    if (!sel.length) {
      throw fail('NO_SELECTION', 'no layer selected');
    }
    app.beginSuppressDialogs();
    try {
      app.beginUndoGroup(req.undoLabel || 'BrandKit');
      try {
        for (i = 0; i < sel.length; i++) {
          out.layers.push(colorLayer(sel[i], req, comp.time));
        }
      } finally {
        app.endUndoGroup();
      }
    } finally {
      app.endSuppressDialogs(false);
    }
    return out;
  };

  // A T2/T3 file on its own, in one undo group.
  A.insertMedia = function (req) {
    var comp = targetComp(req.targetId);
    var stats = { imported: 0 };
    var r, last;
    var bin;
    if (!app.project.file) {
      throw fail('NOT_SAVED', 'project is not saved');
    }
    bin = ensureBin(req.bin);
    importLayout(bin, req.layout, stats);
    app.beginUndoGroup(req.undoLabel || 'BrandKit');
    try {
      r = placeLayout(comp, bin, req.layout, null, stats);
      if (r.first) {
        selectOnly(comp, r.first);
      }
    } finally {
      app.endUndoGroup();
    }
    if (!r.placed.length) {
      throw fail('INSERT_FAILED', 'нечего вставлять');
    }
    last = r.placed[r.placed.length - 1];
    return {
      name: r.placed[0].name,
      startSec: r.placed[0].startSec,
      lengthSec: BK.round(last.startSec + last.lengthSec - r.placed[0].startSec),
      placed: r.placed,
      imported: stats.imported,
      notes: []
    };
  };

  // The whole insert (spec 6.1 «After Effects», steps 3-6): the imports first (the template once per
  // id@version, files of media slots, files of companions; see importLayout), then the layers in one undo group.
  A.insertItem = function (req) {
    var comp = targetComp(req.targetId);
    var notes = [];
    var stats = { imported: 0 };
    var bin, folder, comps, src, layer, group, i, w, readback, imported, keys, companions;
    if (!app.project.file) {
      throw fail('NOT_SAVED', 'project is not saved');
    }
    bin = ensureBin(req.bin);
    folder = findImported(bin, req.libraryKey);
    imported = !folder;
    if (!folder) {
      folder = importAep(req.aep);
      folder.parentFolder = bin;
      folder.comment = tagOf(req.libraryKey);
      if (req.assetDir) {
        notes.push('footage: ' + localizeFootage(folder, req.libraryRoot, req.assetDir).length);
      }
    }
    for (i = 0; i < req.writes.length; i++) {
      if (req.writes[i].type === 'media' && req.writes[i].value) {
        footageFor(String(req.writes[i].value));
      }
    }
    if (req.companions) {
      importLayout(bin, req.companions, stats);
    }
    app.beginUndoGroup(req.undoLabel || 'BrandKit');
    try {
      comps = compsNamed(folder, req.variant.aeComp);
      if (comps.length !== 1) {
        throw fail('TEMPLATE_BROKEN', 'в шаблоне ' + comps.length + ' композиций ' + req.variant.aeComp);
      }
      src = comps[0];
      layer = comp.layers.add(src);
      layer.startTime = req.startSec;
      if (req.scale && !near(req.scale, 1, 0.000001)) {
        scaleLayer(layer, req.scale);
      }

      // Fields first: switching time remap on adds a property and invalidates the ones taken before (S3).
      group = epGroup(layer);
      for (i = 0; i < req.writes.length; i++) {
        if (!writeEp(group, req.writes[i])) {
          notes.push('no property ' + req.writes[i].egpName);
        }
      }
      if (req.serviceDuration && !writeEp(group, { egpName: req.serviceDuration.egpName, type: 'slider', value: req.serviceDuration.value })) {
        notes.push('no property ' + req.serviceDuration.egpName);
      }

      if (req.remap && req.remap.length) {
        keys = applyRemap(layer, req.remap, req.lengthSec);
        notes.push('remap keys: ' + keys);
      } else if (!near(layer.outPoint - layer.inPoint, req.lengthSec)) {
        layer.outPoint = layer.startTime + req.lengthSec;
      }

      if (req.companions) {
        // Companions under the template layer (spec 6.1 «After Effects» step 6).
        companions = placeLayout(comp, bin, req.companions, layer, stats).placed;
      }

      group = epGroup(layer);
      readback = {};
      for (i = 0; i < req.writes.length; i++) {
        w = req.writes[i];
        readback[w.egpName] = readEp(group, w.egpName, w.type);
      }
      if (req.serviceDuration) {
        readback[req.serviceDuration.egpName] = readEp(group, req.serviceDuration.egpName, 'slider');
      }
      selectOnly(comp, layer);
    } finally {
      app.endUndoGroup();
    }
    return {
      name: String(layer.name),
      layerId: layer.id,
      layerIndex: layer.index,
      startSec: BK.round(layer.inPoint),
      lengthSec: BK.round(layer.outPoint - layer.inPoint),
      readback: readback,
      imported: imported,
      notes: notes,
      companions: companions || []
    };
  };

  // After a timeout: is there an instance of the variant comp, or a layer of the media file, starting at that
  // time? (read only)
  A.probeInsert = function (args) {
    var comp = app.project.itemByID(Number(args.targetId));
    var i, l, hit;
    if (!(comp instanceof CompItem)) {
      return { found: false };
    }
    for (i = 1; i <= comp.numLayers; i++) {
      l = comp.layer(i);
      hit = l.source && (args.aeComp ? l.source.name === args.aeComp : (args.file && l.source.file && BK.samePath(l.source.file.fsName, args.file)));
      if (hit && near(l.inPoint, args.startSec, 0.02)) {
        return { found: true, name: String(l.name), layerId: l.id };
      }
    }
    return { found: false };
  };

  // Field values of an instance, read in a call of their own (live checks, spec 8.3).
  A.readFields = function (args) {
    var layer = app.project.layerByID(Number(args.layerId));
    var out = {};
    var group, i;
    if (!layer) {
      throw fail('NO_TARGET', 'no layer ' + args.layerId);
    }
    group = epGroup(layer);
    for (i = 0; i < args.fields.length; i++) {
      out[args.fields[i].egpName] = readEp(group, args.fields[i].egpName, args.fields[i].type);
    }
    return {
      values: out,
      startSec: BK.round(layer.inPoint),
      lengthSec: BK.round(layer.outPoint - layer.inPoint),
      timeRemap: layer.timeRemapEnabled === true
    };
  };

  A.diag = function () {
    var proj = app.project;
    return {
      app: 'After Effects',
      version: String(app.version),
      build: String(app.buildName),
      language: String(app.isoLanguage),
      os: String($.os),
      bk: BK.version,
      project: proj.file ? BK.slash(proj.file.fsName) : null,
      color: colorSettings()
    };
  };

  BK.adapters.ae = A;
}());
