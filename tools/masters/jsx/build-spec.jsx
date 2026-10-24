// Builds a master from a declarative spec (PARAMS.spec, resolved in Node) in a NEW project and saves it as
// PARAMS.out.aep. Composed after spikes/lib/check.jsx, spikes/lib/ae-project.jsx, ae-build-lib.jsx.
// spec: comp { name, w, h, fps, duration }, layers (creation order, bottom first), keys, expressions, mattes,
// markers, egp, order (expected top-to-bottom names). Property paths (sp.path):
//   ['transform', matchName] | ['group', group, item, matchName] | ['text'] | ['animator', name, matchName]
//   | ['selector', animator, matchName] | ['effect', name, effectMatchName, paramIndexOrMatchName]
var SB = { ready: false, comp: null };

function sbStep(name, required, fn) {
  return check(name, function () {
    if (!SB.ready) {
      return { pass: false, detail: 'skipped: no fresh project' };
    }
    return fn();
  }, required);
}

function sbLayer(name) {
  return bkLayer(SB.comp, name);
}

function sbProp(layerName, path) {
  return sbLayerProp(sbLayer(layerName), path);
}

// A property of a layer by a spec path (also of a layer in a transplanted comp: spec.transplant comps[].set).
function sbLayerProp(L, path) {
  var kind = path[0];
  if (kind === 'transform') {
    return bdXform(L, path[1]);
  }
  if (kind === 'group') {
    return bdGroupItem(L, path[1], path[2]).property(path[3]);
  }
  if (kind === 'text') {
    return bkSourceText(L);
  }
  if (kind === 'animator') {
    return bdAnimator(L, path[1]).property('ADBE Text Animator Properties').property(path[2]);
  }
  if (kind === 'selector') {
    return bdAnimator(L, path[1]).property('ADBE Text Selectors').property(1).property(path[2]);
  }
  if (kind === 'effect') {
    return bkEffect(L, path[1], path[2]).property(path[3]);
  }
  if (kind === 'timeRemap') {
    return L.property('ADBE Time Remapping');
  }
  if (kind === 'mask') {
    // ['mask', maskName, matchName] — a mask of a transplanted layer (BG_WebinarPortal: the portal's moving edge)
    return L.property('ADBE Mask Parade').property(path[1]).property(path[2]);
  }
  throw new Error('BK_PATH: ' + path.join('/'));
}

// ---- Transplant: layers of a pack comp moved over exactly as the pack has them (PARAMS.spec.transplant) ----
// The relinked working copy is imported into the new project; the source comp is duplicated once per target
// comp and keeps only the listed layers (pack layer indices, names checked); the comps and solids they use
// move to one folder; the rest of the import is removed. The working copy itself is only read.

function sbFolderItems(folder, out) {
  for (var i = 1; i <= folder.numItems; i++) {
    var it = folder.item(i);
    out.push(it);
    if (it instanceof FolderItem) {
      sbFolderItems(it, out);
    }
  }
  return out;
}

// The items a comp needs, nested comps followed (null layers use a solid too).
function sbUses(comp, seen, out) {
  for (var i = 1; i <= comp.numLayers; i++) {
    var src = null;
    try {
      src = comp.layer(i).source;
    } catch (e) {
      src = null;
    }
    if (src && !seen[src.id]) {
      seen[src.id] = true;
      out.push(src);
      if (src instanceof CompItem) {
        sbUses(src, seen, out);
      }
    }
  }
  return out;
}

// A longer comp: layers that ran to its end run to the new end (a precomp layer only as far as its source).
// all: every layer runs to the new end (decor whose layers the pack ends before its comp does: the master
// cuts them itself), else only the layers that ran to the old end
function sbExtend(comp, d, all) {
  var old = comp.duration;
  comp.duration = d;
  for (var i = 1; i <= comp.numLayers; i++) {
    var L = comp.layer(i);
    if (all || Math.abs(L.outPoint - old) < 1e-6) {
      L.outPoint = d;
    }
  }
  return comp.name + ' ' + old + ' -> ' + comp.duration + ' s' + (all ? ' (every layer)' : '');
}

// The one pack comp a transplant (or one of its target comps) takes its layers from.
function sbTransplantSource(all, s) {
  var hits = [];
  for (var i = 0; i < all.length; i++) {
    var it = all[i];
    if (it instanceof CompItem && it.name === s.name && it.width === s.w && it.height === s.h && it.numLayers === s.layers) {
      hits.push(it);
    }
  }
  if (hits.length !== 1) {
    throw new Error('BK_TRANSPLANT_SOURCE: ' + s.name + ' x' + hits.length);
  }
  return hits[0];
}

function sbLayerNames(comp) {
  var names = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    names.push(comp.layer(i).name);
  }
  return names;
}

// One change in a transplanted comp: the layer by its (unique) name, the property by spec path, a value or an
// expression (checked: a disabled expression stops the build).
function sbTransplantSet(comp, s) {
  var sl = null;
  for (var q = 1; q <= comp.numLayers; q++) {
    if (comp.layer(q).name === s.layer) {
      if (sl) {
        throw new Error('BK_TRANSPLANT_SET: two layers named ' + s.layer + ' in ' + comp.name);
      }
      sl = comp.layer(q);
    }
  }
  if (!sl) {
    throw new Error('BK_TRANSPLANT_SET: no layer ' + s.layer + ' in ' + comp.name);
  }
  var sp = sbLayerProp(sl, s.path);
  if (s.expr !== undefined) {
    sp.expression = s.expr;
    if (!sp.expressionEnabled) {
      throw new Error('BK_TRANSPLANT_SET: the expression on ' + s.layer + ' ' + s.path.join('/') + ' is disabled: ' + sp.expressionError);
    }
  } else {
    if (sp.expressionEnabled) {
      sp.expressionEnabled = false;
    }
    sp.setValue(s.value);
  }
}

// The one layer of a comp with that name; two or none stop the build.
function sbUniqueLayer(comp, name, code) {
  var hit = null;
  for (var q = 1; q <= comp.numLayers; q++) {
    if (comp.layer(q).name === name) {
      if (hit) {
        throw new Error(code + ': two layers named ' + name + ' in ' + comp.name);
      }
      hit = comp.layer(q);
    }
  }
  if (!hit) {
    throw new Error(code + ': no layer ' + name + ' in ' + comp.name);
  }
  return hit;
}

function sbTransplant(tp) {
  var i, j, c, it;
  var f = new File(tp.aep);
  if (!f.exists) {
    throw new Error('BK_NO_FILE: ' + tp.aep);
  }
  var opts = new ImportOptions(f);
  opts.importAs = ImportAsType.PROJECT;
  var root = bkQuiet(function () {
    return app.project.importFile(opts);
  });
  if (!(root instanceof FolderItem)) {
    throw new Error('BK_IMPORT: ' + tp.aep);
  }
  var all = sbFolderItems(root, []);
  var made = [];
  for (i = 0; i < tp.comps.length; i++) {
    c = tp.comps[i];
    // a target comp may come from its own pack comp (CRS_Cover: the header of one cover, the bars of another)
    var src = sbTransplantSource(all, c.source || tp.source);
    var keep = {};
    for (j = 0; j < c.keep.length; j++) {
      if (src.layer(c.keep[j].index).name !== c.keep[j].name) {
        throw new Error('BK_TRANSPLANT_LAYER: ' + src.name + ' #' + c.keep[j].index + ' is ' + src.layer(c.keep[j].index).name);
      }
      keep[c.keep[j].index] = true;
    }
    var dup = src.duplicate();
    dup.name = c.name;
    for (j = dup.numLayers; j >= 1; j--) {
      // a locked layer of the pack (the BG of «Оверлей со спикером», the ground of the webinar screens) can be neither
      // removed nor lengthened nor changed locked; the master's copy keeps no locks
      dup.layer(j).locked = false;
      if (!keep[j]) {
        dup.layer(j).remove();
      }
    }
    // size: the comp made another frame, its layers left where they were for set to place (POD_Intro: the 16:9 intro
    // re-laid out in 2160x3840, as the pack's vertical render has it)
    if (c.size) {
      dup.width = c.size[0];
      dup.height = c.size[1];
    }
    // copies: a kept layer duplicated under a new name, right above it (POD_Intro: one more arrow of a kind)
    var copies = c.copies || [];
    for (j = 0; j < copies.length; j++) {
      sbUniqueLayer(dup, copies[j].layer, 'BK_TRANSPLANT_COPY').duplicate().name = copies[j].name;
    }
    // kept for their children only (a parent whose picture the master draws itself): no video
    var hide = c.hide || [];
    for (j = 0; j < hide.length; j++) {
      var hl = null;
      for (var q = 1; q <= dup.numLayers; q++) {
        if (dup.layer(q).name === hide[j]) {
          if (hl) {
            throw new Error('BK_TRANSPLANT_HIDE: two layers named ' + hide[j] + ' in ' + c.name);
          }
          hl = dup.layer(q);
        }
      }
      if (!hl) {
        throw new Error('BK_TRANSPLANT_HIDE: no layer ' + hide[j] + ' in ' + c.name);
      }
      hl.enabled = false;
    }
    // flat: planar 3D layers (z 0, not turned) made 2D, they look the same; collapsed into a variant of another size,
    // 3D layers would follow the default camera of the master's size, half the size difference off (TRN_Bars)
    if (c.flat === true) {
      for (j = 1; j <= dup.numLayers; j++) {
        if (dup.layer(j).threeDLayer) {
          dup.layer(j).threeDLayer = false;
        }
      }
    }
    // set: what the master changes in the pack's layers, a value or an expression by spec path (BG_Arrows: the
    // wandering point's wiggle made a loop; BG_Rack: the noise cycles its evolution); an entry with `comp` changes a
    // nested comp the target uses, once all of them are known
    var sets = c.set || [];
    for (j = 0; j < sets.length; j++) {
      if (sets[j].comp === undefined) {
        sbTransplantSet(dup, sets[j]);
      }
    }
    // span: when a layer shows (POD_Intro: the vertical arrows come in on frames of their own)
    var spans = c.span || [];
    for (j = 0; j < spans.length; j++) {
      var sl = sbUniqueLayer(dup, spans[j].layer, 'BK_TRANSPLANT_SPAN');
      // AE keeps a layer's length when its in point moves (AE 26.5: an arrow brought in 0.24 s earlier left 0.24 s
      // early): the out point is put back, or set
      var out = spans[j].outPoint !== undefined ? spans[j].outPoint : sl.outPoint;
      if (spans[j].inPoint !== undefined) {
        sl.inPoint = spans[j].inPoint;
      }
      sl.outPoint = out;
    }
    while (dup.markerProperty.numKeys > 0) {
      dup.markerProperty.removeKey(1);
    }
    dup.motionBlur = false;
    SB.decor[c.name] = dup;
    made.push(dup);
  }
  // the comps they use: nested comps first get longer, then the targets (a precomp layer stops at its source)
  var seen = {};
  var uses = [];
  for (i = 0; i < made.length; i++) {
    sbUses(made[i], seen, uses);
  }
  // changes in the nested comps (set entries with `comp`, BG_WebinarPortal: the rack's noise inside its animation)
  for (i = 0; i < tp.comps.length; i++) {
    var nested = tp.comps[i].set || [];
    for (j = 0; j < nested.length; j++) {
      if (nested[j].comp === undefined) {
        continue;
      }
      var inner = null;
      for (var u = 0; u < uses.length; u++) {
        if (uses[u] instanceof CompItem && uses[u].name === nested[j].comp) {
          if (inner && inner !== uses[u]) {
            throw new Error('BK_TRANSPLANT_SET: two nested comps named ' + nested[j].comp);
          }
          inner = uses[u];
        }
      }
      if (!inner) {
        throw new Error('BK_TRANSPLANT_SET: no nested comp ' + nested[j].comp + ' in ' + tp.comps[i].name);
      }
      sbTransplantSet(inner, nested[j]);
    }
  }
  var log = [];
  var ext = tp.extend || [];
  for (i = 0; i < ext.length; i++) {
    var hit = null;
    for (j = 0; j < uses.length; j++) {
      if (uses[j] instanceof CompItem && uses[j].name === ext[i].comp) {
        if (hit) {
          throw new Error('BK_TRANSPLANT_EXTEND: two comps named ' + ext[i].comp);
        }
        hit = uses[j];
      }
    }
    if (!hit) {
      throw new Error('BK_TRANSPLANT_EXTEND: no comp ' + ext[i].comp);
    }
    log.push(sbExtend(hit, ext[i].duration));
  }
  for (i = 0; i < tp.comps.length; i++) {
    if (tp.comps[i].duration) {
      log.push(sbExtend(made[i], tp.comps[i].duration, tp.comps[i].extendLayers === true));
    }
  }
  var folder = app.project.items.addFolder(tp.folder);
  for (i = 0; i < made.length; i++) {
    made[i].parentFolder = folder;
  }
  for (i = 0; i < uses.length; i++) {
    uses[i].parentFolder = folder;
  }
  root.remove();
  var out = { comps: [], uses: [], extended: log, items: app.project.numItems };
  var ok = true;
  for (i = 0; i < made.length; i++) {
    var names = sbLayerNames(made[i]);
    var want = [];
    for (j = 0; j < tp.comps[i].keep.length; j++) {
      want.push(tp.comps[i].keep[j].name);
    }
    // a copy stands right above its layer
    var cps = tp.comps[i].copies || [];
    for (j = 0; j < cps.length; j++) {
      for (var w = 0; w < want.length; w++) {
        if (want[w] === cps[j].layer) {
          want.splice(w, 0, cps[j].name);
          break;
        }
      }
    }
    ok = ok && names.join('|') === want.join('|');
    out.comps.push({ name: made[i].name, size: made[i].width + 'x' + made[i].height, duration: made[i].duration, renderer: made[i].renderer, layers: names });
  }
  for (i = 0; i < uses.length; i++) {
    out.uses.push(uses[i].name + (uses[i] instanceof CompItem ? ' (comp ' + uses[i].duration + ' s)' : ''));
  }
  return { pass: ok && app.project.expressionEngine === 'javascript-1.0', detail: out };
}

function sbMakeLayer(spec) {
  var L = null;
  var i;
  if (spec.type === 'null') {
    L = bdNull(SB.comp, spec.name);
  } else if (spec.type === 'shape') {
    L = bdShapeLayer(SB.comp, spec.name);
    for (var g = 0; g < spec.groups.length; g++) {
      var G = spec.groups[g];
      bdGroup(L, G.name);
      if (G.rect) {
        bdRect(L, G.name, 'Rect');
      }
      var paths = G.paths || [];
      for (i = 0; i < paths.length; i++) {
        bdPath(L, G.name, paths[i], 'Path ' + (i + 1));
      }
      // a group without fill is a stroke only (G.fill null)
      if (G.fill) {
        bdFill(L, G.name, G.fill, 'Fill');
      }
      if (G.stroke) {
        bdStroke(L, G.name, G.stroke.color, G.stroke.width, 'Stroke');
      }
      if (G.position) {
        L.property('ADBE Root Vectors Group').property(G.name).property('ADBE Vector Transform Group')
          .property('ADBE Vector Position').setValue(G.position);
      }
    }
  } else if (spec.type === 'text') {
    var t = spec.text;
    L = bdText(SB.comp, spec.name, t.value === '' ? ' ' : t.value, t);
    var st = bkSourceText(L);
    var doc = st.value;
    if (t.value === '') {
      doc.text = '';
    }
    if (t.allCaps) {
      // allCaps is read-only; caps are set through fontCapsOption (AE 24.0+)
      doc.fontCapsOption = FontCapsOption.FONT_ALL_CAPS;
    }
    st.setValue(doc);
    var anims = spec.animators || [];
    for (i = 0; i < anims.length; i++) {
      bdAddAnimator(L, anims[i].name);
      if (anims[i].position !== false) {
        bdAnimatorPosition(L, anims[i].name);
      }
      if (anims[i].opacity !== undefined) {
        bdAnimatorProp(L, anims[i].name, 'ADBE Text Opacity').setValue(anims[i].opacity);
      }
      // a fill over the whole text (its colour by expression: CRS_Cover's lines dark on the green variant)
      if (anims[i].fill) {
        bdAnimatorProp(L, anims[i].name, 'ADBE Text Fill Color').setValue([anims[i].fill[0], anims[i].fill[1], anims[i].fill[2], 1]);
      }
      // tracking added over the whole text, in pixels a character at the layer's font (not thousandths of an em):
      // WEB_Announce's title, by expression 0 in 1:1 and 16/1000 x 70 px in 9:16
      if (anims[i].tracking !== undefined) {
        bdAnimatorProp(L, anims[i].name, 'ADBE Text Tracking Amount').setValue(anims[i].tracking);
      }
      bdRangeSelector(L, anims[i].name, anims[i].basedOn);
    }
  } else if (spec.type === 'precomp') {
    var source = SB.decor[spec.source];
    if (!source) {
      throw new Error('BK_NO_DECOR: ' + spec.source);
    }
    L = SB.comp.layers.add(source);
    L.name = spec.name;
    if (spec.timeRemap) {
      L.timeRemapEnabled = true;
    }
    bdSpan(L, SB.comp.duration);
    // collapse: the decor's vector layers render at the size of the frame (CRS_Cover's 2560x1440 decor is scaled
    // up 1.5 times in the 4K variant; rasterized at its own size it would come out soft)
    L.collapseTransformation = spec.collapse === true;
  } else if (spec.type === 'slot') {
    // a Media Replacement slot (C28): a placeholder comp of the slot's frame, empty or with the default content
    // (placeholder.layers, built inside it the same way); an alternate source is wrapped by AE into a comp of
    // this size and fills it (AE 26.5, checked 2026-10-21). Slots that share a placeholder share its comp.
    var ph = SB.placeholders[spec.placeholder.name];
    if (!ph) {
      ph = app.project.items.addComp(spec.placeholder.name, spec.placeholder.w, spec.placeholder.h, 1, SB.comp.duration, SB.comp.frameRate);
      ph.bgColor = [0, 0, 0];
      SB.placeholders[spec.placeholder.name] = ph;
      var inner = spec.placeholder.layers || [];
      var host = SB.comp;
      SB.comp = ph;
      try {
        for (i = 0; i < inner.length; i++) {
          sbMakeLayer(inner[i]);
        }
      } finally {
        SB.comp = host;
      }
    }
    L = SB.comp.layers.add(ph);
    L.name = spec.name;
    bdSpan(L, SB.comp.duration);
    L.collapseTransformation = false;
  } else {
    throw new Error('BK_LAYER_TYPE: ' + spec.type);
  }
  if (spec.anchor) {
    bdXform(L, 'ADBE Anchor Point').setValue(spec.anchor);
  }
  var fx = spec.effects || [];
  for (i = 0; i < fx.length; i++) {
    if (fx[i].kind === 'slider') {
      bdSlider(L, fx[i].name, fx[i].value || 0);
    } else if (fx[i].kind === 'checkbox') {
      bdCheckbox(L, fx[i].name, fx[i].value);
    } else if (fx[i].kind === 'dropdown') {
      var r = bdDropdown(L, fx[i].name, fx[i].items, fx[i].value);
      if (r.items === null || r.items.join('|') !== fx[i].items.join('|')) {
        throw new Error('BK_DROPDOWN_ITEMS: ' + fx[i].name);
      }
    } else {
      var made = bdAddEffect(L, fx[i].matchName, fx[i].name);
      // values: the effect's parameters by match name (BG_Plus: the noise of the pack, the tiling of its grid)
      var vals = fx[i].values || {};
      for (var vk in vals) {
        if (vals.hasOwnProperty(vk)) {
          made.property(vk).setValue(vals[vk]);
        }
      }
    }
  }
  if (spec.shy) {
    L.shy = true;
  }
  return L;
}

check('project: new, expression engine javascript-1.0', function () {
  bkNewProject();
  app.project.expressionEngine = 'javascript-1.0';
  SB.ready = true;
  return { pass: app.project.expressionEngine === 'javascript-1.0', detail: 'AE ' + app.version };
}, true);

sbStep('project colour: 8 bpc, no working space, no linearization, no linear blending', true, function () {
  return bdProjectColour();
});

check('fonts resolve to real files: ' + PARAMS.spec.fonts.join(', '), function () {
  var out = [];
  var ok = true;
  for (var i = 0; i < PARAMS.spec.fonts.length; i++) {
    var list = app.fonts.getFontsByPostScriptName(PARAMS.spec.fonts[i]);
    var loc = list.length ? String(list[0].location) : '';
    if (!list.length || /times\.ttf$/i.test(loc)) {
      ok = false;
    }
    out.push(PARAMS.spec.fonts[i] + ' ' + (list.length ? String(list[0].version) : 'missing'));
  }
  return { pass: ok, detail: out };
}, false);

if (SB.ready) {
  app.beginUndoGroup('BK build ' + PARAMS.id);
}

sbStep('comp ' + PARAMS.spec.comp.name, true, function () {
  var c = PARAMS.spec.comp;
  SB.comp = app.project.items.addComp(c.name, c.w, c.h, 1, c.duration, c.fps);
  SB.comp.bgColor = [0, 0, 0];
  SB.comp.motionBlur = false;
  SB.comp.workAreaStart = 0;
  SB.comp.workAreaDuration = c.duration;
  bdClassic3d(SB.comp);
  return { pass: SB.comp.frameRate === c.fps && Math.abs(SB.comp.duration - c.duration) < 1e-6, detail: SB.comp.width + 'x' + SB.comp.height + ' ' + c.duration + ' s' };
});

SB.decor = {};
SB.placeholders = {};
if (PARAMS.spec.transplant) {
  sbStep('transplant: ' + PARAMS.spec.transplant.source.name + ' -> ' + PARAMS.spec.transplant.comps.length + ' comps', true, function () {
    return sbTransplant(PARAMS.spec.transplant);
  });
  sbStep('project colour after the import: 8 bpc, no working space, no linearization', true, function () {
    return bdProjectColour();
  });
}

sbStep('layers (' + PARAMS.spec.layers.length + ')', true, function () {
  var made = [];
  for (var i = 0; i < PARAMS.spec.layers.length; i++) {
    made.push(sbMakeLayer(PARAMS.spec.layers[i]).name);
  }
  return { pass: made.length === PARAMS.spec.layers.length, detail: made };
});

sbStep('keys (' + PARAMS.spec.keys.length + ' properties) from the pack curves', true, function () {
  var bad = [];
  for (var i = 0; i < PARAMS.spec.keys.length; i++) {
    var k = PARAMS.spec.keys[i];
    var n = bdKeys(sbProp(k.layer, k.path), k.keys);
    if (n !== k.keys.length) {
      bad.push(k.layer + ' ' + k.path.join('/') + ': ' + n);
    }
  }
  return { pass: bad.length === 0, detail: bad.length ? bad : PARAMS.spec.keys.length + ' properties keyed' };
});

// Expressions go in last: one that names a missing layer is disabled by AE on the spot.
sbStep('expressions (' + PARAMS.spec.expressions.length + ')', true, function () {
  var bad = [];
  for (var i = 0; i < PARAMS.spec.expressions.length; i++) {
    var e = PARAMS.spec.expressions[i];
    var p = sbProp(e.layer, e.path);
    var err = bdExpr(p, e.src);
    if (err !== '' || p.expressionEnabled !== true) {
      bad.push(e.layer + ' ' + e.path.join('/') + ': ' + (err || 'disabled'));
    }
  }
  return { pass: bad.length === 0, detail: { set: PARAMS.spec.expressions.length, errors: bad } };
});

sbStep('mattes (' + PARAMS.spec.mattes.length + ')', true, function () {
  var r = [];
  var ok = true;
  for (var i = 0; i < PARAMS.spec.mattes.length; i++) {
    var m = PARAMS.spec.mattes[i];
    var res = bdMatte(sbLayer(m.layer), sbLayer(m.matte), m.type);
    ok = ok && res.ok === true;
    r.push(res);
  }
  // setTrackMatte hides the matte layer; plates are mattes and visible at the same time
  for (var j = 0; j < PARAMS.spec.visible.length; j++) {
    sbLayer(PARAMS.spec.visible[j]).enabled = true;
  }
  return { pass: ok, detail: r };
});

sbStep('markers: protected regions in / out', true, function () {
  var got = bdMarkers(SB.comp, PARAMS.spec.markers);
  var ok = got.length === PARAMS.spec.markers.length;
  for (var j = 0; ok && j < got.length; j++) {
    ok = got[j].protectedRegion && got[j].comment === PARAMS.spec.markers[j].comment &&
      Math.abs(got[j].time - PARAMS.spec.markers[j].time) < 1e-3 && Math.abs(got[j].duration - PARAMS.spec.markers[j].duration) < 1e-3;
  }
  return { pass: ok, detail: got };
});

sbStep('layer order and switches: flat, no motion blur, startTime 0', true, function () {
  var names = [];
  var bad = [];
  for (var i = 1; i <= SB.comp.numLayers; i++) {
    var L = SB.comp.layer(i);
    names.push(L.name);
    if (L.motionBlur) {
      bad.push(L.name + ': motion blur');
    }
    if (L.startTime !== 0) {
      bad.push(L.name + ': startTime ' + L.startTime);
    }
  }
  return { pass: names.join(',') === PARAMS.spec.order.join(',') && bad.length === 0, detail: { order: names, problems: bad } };
});

sbStep('expressions: every one evaluates without errors at the sweep times', true, function () {
  var r = bdExprSweep(SB.comp, PARAMS.sweepTimes);
  return { pass: r.errors.length === 0, detail: r };
});

// Measurements Node asked for: per case, set the texts and controls, read source rects and positions,
// then put the defaults back (the saved master keeps its defaults).
sbStep('measurements (' + (PARAMS.spec.measure || []).length + ' cases)', true, function () {
  var out = [];
  var cases = PARAMS.spec.measure || [];
  var setText = function (n, s) {
    var st = bkSourceText(sbLayer(n));
    var doc = st.valueAtTime(0, true);
    doc.text = s;
    st.setValue(doc);
  };
  for (var c = 0; c < cases.length; c++) {
    var cs = cases[c];
    var key;
    for (key in cs.text) {
      if (cs.text.hasOwnProperty(key)) {
        setText(key, cs.text[key]);
      }
    }
    for (key in cs.ctrl) {
      if (cs.ctrl.hasOwnProperty(key)) {
        sbLayer('CTRL').property('ADBE Effect Parade').property(key).property(1).setValue(cs.ctrl[key]);
      }
    }
    var row = { name: cs.name, rects: {}, positions: {}, baselines: {} };
    for (var i = 0; i < cs.layers.length; i++) {
      var L = sbLayer(cs.layers[i]);
      var r = L.sourceRectAtTime(cs.t, false);
      row.rects[cs.layers[i]] = [r.left, r.top, r.width, r.height];
      row.positions[cs.layers[i]] = bdXform(L, 'ADBE Position').valueAtTime(cs.t, false);
      if (L instanceof TextLayer) {
        try {
          row.baselines[cs.layers[i]] = bkSourceText(L).valueAtTime(cs.t, false).baselineLocs;
        } catch (eb) {
          row.baselines[cs.layers[i]] = null;
        }
      }
    }
    out.push(row);
  }
  var d = PARAMS.spec.defaults;
  for (var t in d.text) {
    if (d.text.hasOwnProperty(t)) {
      setText(t, d.text[t]);
    }
  }
  for (var e in d.ctrl) {
    if (d.ctrl.hasOwnProperty(e)) {
      sbLayer('CTRL').property('ADBE Effect Parade').property(e).property(1).setValue(d.ctrl[e]);
    }
  }
  return { pass: true, detail: out };
});

sbStep('Essential Graphics (' + PARAMS.spec.egp.length + ' controllers; QA left out)', true, function () {
  var added = [];
  for (var i = 0; i < PARAMS.spec.egp.length; i++) {
    var e = PARAMS.spec.egp[i];
    // a text field, a media slot (the layer itself) or a control on CTRL
    var prop = e.text ? bkSourceText(sbLayer(e.text)) : (e.slot ? sbLayer(e.slot) : bkEffect(sbLayer('CTRL'), e.effect, e.matchName).property(1));
    added.push(bdEgpAdd(SB.comp, prop, e.label));
  }
  var names = bdEgpNames(SB.comp);
  return { pass: names.join('|') === PARAMS.spec.egpNames.join('|'), detail: { added: added, names: names } };
});

if (SB.ready) {
  app.endUndoGroup();
}

sbStep('saved: ' + PARAMS.out.aep, true, function () {
  var r = bkSaveAs(PARAMS.out.aep);
  return { pass: r.bytes > 0 && r.dirty === false, detail: r };
});

var SB_DATA = { project: '', comp: null };
try {
  SB_DATA.project = bkProjectPath();
  if (SB.comp) {
    SB_DATA.comp = { name: SB.comp.name, id: SB.comp.id, layers: SB.comp.numLayers, markers: bkMarkers(SB.comp) };
  }
} catch (e0) {
  SB_DATA.error = String(e0);
}
finish(SB_DATA);
