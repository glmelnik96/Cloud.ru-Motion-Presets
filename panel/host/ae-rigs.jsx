// BrandKit «Движения» for After Effects (ES3): the brand movements M1-M12 of panel/src/core/rigs.ts on the selected
// layers. The core sends operations with times in seconds from the start of the movement and the eases of AE; this
// file only writes them: keys on transform properties and stroke widths, a text animator, a rectangle mask, a
// Fractal Noise matte, an expression. One undo group for all layers; script dialogs suppressed around it.
// Docs: https://ae-scripting.docsforadobe.dev/ (Property setValueAtTime, setTemporalEaseAtKey, KeyframeEase,
// PropertyGroup addProperty, AVLayer sourceRectAtTime, setTrackMatte 23.0+, Shape, MaskMode, TrackMatteType).
(function () {
  var A = BK.adapters.ae;
  if (!A) {
    return;
  }

  function fail(code, msg, detail) {
    return BK.fail(code, msg, detail);
  }

  function sub(g, name) {
    var p = null;
    try { p = g ? g.property(name) : null; } catch (e) { p = null; }
    return p;
  }

  function targetComp(targetId) {
    var c = app.project.activeItem;
    if (!c || !(c instanceof CompItem)) {
      throw fail('NO_TARGET', 'no active composition');
    }
    if (targetId !== undefined && targetId !== null && String(c.id) !== String(targetId)) {
      throw fail('NO_TARGET', 'the active composition changed');
    }
    return c;
  }

  function isText(layer) {
    return !!sub(layer, 'ADBE Text Properties');
  }

  function isShape(layer) {
    return !!sub(layer, 'ADBE Root Vectors Group');
  }

  // Leaf properties with this match name under a group, a few levels deep.
  function propsByMatch(group, matchName, out, depth) {
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
          out.push(p);
        }
      } else {
        propsByMatch(p, matchName, out, depth + 1);
      }
    }
    return out;
  }

  function named(group, name) {
    var i, p;
    for (i = 1; group && i <= group.numProperties; i++) {
      p = group.property(i);
      if (String(p.name) === name) {
        return p;
      }
    }
    return null;
  }

  function easeList(n, e, speed) {
    var out = [];
    var d;
    for (d = 0; d < n; d++) {
      out.push(new KeyframeEase(speed(d, e[0], n), e[1]));
    }
    return out;
  }

  // The keys of an operation on one property: values first, then the interpolation and the eases of each key by
  // its index. A side without an ease in the operation keeps what AE gave it; linear keys are linear on both sides.
  function writeKeys(p, t0, keys, value, speed) {
    var B = KeyframeInterpolationType.BEZIER;
    var L = KeyframeInterpolationType.LINEAR;
    var i, k, n, ei, eo;
    for (i = 0; i < keys.length; i++) {
      p.setValueAtTime(t0 + keys[i].t, value(keys[i].v));
    }
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      n = p.nearestKeyIndex(t0 + k.t);
      if (k.linear) {
        p.setInterpolationTypeAtKey(n, L, L);
        continue;
      }
      ei = k['in'];
      eo = k.out;
      if (!ei && !eo) {
        continue;
      }
      p.setInterpolationTypeAtKey(n, ei ? B : p.keyInInterpolationType(n), eo ? B : p.keyOutInterpolationType(n));
      p.setTemporalEaseAtKey(n,
        ei ? easeList(p.keyInTemporalEase(n).length, ei, speed) : p.keyInTemporalEase(n),
        eo ? easeList(p.keyOutTemporalEase(n).length, eo, speed) : p.keyOutTemporalEase(n));
    }
    return keys.length;
  }

  function applyMode(mode, base, v) {
    if (mode === 'add') {
      return base + v;
    }
    if (mode === 'mul') {
      return base * v;
    }
    return v;
  }

  // The properties a track keys: Scale, Opacity, X Rotation, Position (or its separated dimensions), the stroke
  // widths of a shape layer. Each comes with the dimensions it keys (null: the property is one number).
  function trackTargets(layer, op) {
    var tr = sub(layer, 'ADBE Transform Group');
    var out = [];
    var pos, i, list;
    if (op.prop === 'scale') {
      out.push({ p: sub(tr, 'ADBE Scale'), dims: op.dims || null });
    } else if (op.prop === 'opacity') {
      out.push({ p: sub(tr, 'ADBE Opacity'), dims: null });
    } else if (op.prop === 'rotationX') {
      out.push({ p: sub(tr, 'ADBE Rotate X'), dims: null });
    } else if (op.prop === 'position') {
      pos = sub(tr, 'ADBE Position');
      if (pos && pos.dimensionsSeparated) {
        for (i = 0; i < op.dims.length; i++) {
          out.push({ p: sub(tr, 'ADBE Position_' + op.dims[i]), dims: null, one: i });
        }
      } else {
        out.push({ p: pos, dims: op.dims || null, spatial: true });
      }
    } else if (op.prop === 'strokeWidth') {
      list = propsByMatch(sub(layer, 'ADBE Root Vectors Group'), 'ADBE Vector Stroke Width', [], 0);
      for (i = 0; i < list.length; i++) {
        out.push({ p: list[i], dims: null });
      }
    }
    return out;
  }

  // Values of a key on one target: the dimensions of the operation from the current value by its mode, the other
  // dimensions as they are. A separated dimension takes its own entry of the key.
  function trackValue(tg, mode, base) {
    return function (v) {
      var out, d, j;
      if (tg.one !== undefined) {
        return applyMode(mode, base, v instanceof Array ? v[tg.one] : v);
      }
      if (!(base instanceof Array)) {
        return applyMode(mode, base, v instanceof Array ? v[0] : v);
      }
      out = base.slice(0);
      for (j = 0; j < base.length; j++) {
        d = tg.dims ? indexOf(tg.dims, j) : j;
        if (d < 0) {
          continue;
        }
        out[j] = applyMode(mode, base[j], v instanceof Array ? v[tg.dims ? d : j] : v);
      }
      return out;
    };
  }

  function indexOf(list, x) {
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] === x) {
        return i;
      }
    }
    return -1;
  }

  // Speeds of an ease: times the current value for 'mul'; one speed along the path of a spatial property, never
  // negative there.
  function trackSpeed(tg, mode, base) {
    return function (d, s, n) {
      var dim = tg.dims ? tg.dims[0] : d;
      var b = base instanceof Array ? base[n === 1 ? dim : d] : base;
      var v = mode === 'mul' ? s * b : s;
      return (tg.spatial && n === 1) ? Math.abs(v) : v;
    };
  }

  // Straight segments between the keys of a spatial property, as the separated dimensions of the packs move: no
  // tangents, no auto Bezier in space.
  function straighten(p, t0, keys, base) {
    var zero = base instanceof Array && base.length === 3 ? [0, 0, 0] : [0, 0];
    var i, n;
    for (i = 0; i < keys.length; i++) {
      n = p.nearestKeyIndex(t0 + keys[i].t);
      try {
        p.setSpatialAutoBezierAtKey(n, false);
        p.setSpatialContinuousAtKey(n, false);
        p.setSpatialTangentsAtKey(n, zero, zero);
      } catch (e) { n = n || 0; }
    }
  }

  function track(layer, t0, op, index, rec) {
    var targets = trackTargets(layer, op);
    var keys = op.keySets && op.keySets.length ? op.keySets[index % op.keySets.length] : op.keys;
    var i, tg, base;
    if (op.prop === 'strokeWidth' && !targets.length) {
      return;
    }
    for (i = 0; i < targets.length; i++) {
      tg = targets[i];
      if (!tg.p) {
        continue;
      }
      base = tg.p.valueAtTime(t0, false);
      rec.keys += writeKeys(tg.p, t0, keys, trackValue(tg, op.mode, base), trackSpeed(tg, op.mode, base));
      if (tg.spatial) {
        straighten(tg.p, t0, keys, base);
      }
      if (op.expression) {
        tg.p.expression = op.expression;
      }
    }
  }

  // The animator of a movement on a text layer, found again by its name or added; added properties invalidate the
  // objects taken before, so each is looked up again from the layer. An animator property not added yet is there
  // all the same, hidden (setting it fails: AE 26.5 on the build PC), so canAddProperty tells whether to add it.
  function animator(layer, name) {
    var anims = sub(sub(layer, 'ADBE Text Properties'), 'ADBE Text Animators');
    var a = named(anims, name);
    if (!a) {
      anims.addProperty('ADBE Text Animator').name = name;
      a = named(sub(sub(layer, 'ADBE Text Properties'), 'ADBE Text Animators'), name);
    }
    return a;
  }

  function textRise(layer, t0, op, rect, rec) {
    var h = rect.height;
    var a, props, pos, sels, sel, adv;
    a = animator(layer, op.name);
    props = sub(a, 'ADBE Text Animator Properties');
    if (props.canAddProperty('ADBE Text Position 3D')) {
      props.addProperty('ADBE Text Position 3D');
      a = animator(layer, op.name);
    }
    sels = sub(a, 'ADBE Text Selectors');
    if (!sels.numProperties) {
      sels.addProperty('ADBE Text Selector');
      a = animator(layer, op.name);
    }
    pos = sub(sub(a, 'ADBE Text Animator Properties'), 'ADBE Text Position 3D');
    sel = sub(a, 'ADBE Text Selectors').property(1);
    adv = sub(sel, 'ADBE Text Range Advanced');
    sub(adv, 'ADBE Text Range Type2').setValue(op.basedOn);
    if (op.rise) {
      pos.setValue([0, BK.round(op.rise * h), 0]);
    }
    if (op.positionKeys) {
      rec.keys += writeKeys(pos, t0, op.positionKeys,
        function (v) { return [0, BK.round(v * h), 0]; },
        function (d, s, n) { return n === 1 ? Math.abs(s * h) : (d === 1 ? s * h : 0); });
    }
    if (op.startKeys) {
      rec.keys += writeKeys(sub(sel, 'ADBE Text Percent Start'), t0, op.startKeys,
        function (v) { return v; },
        function (d, s) { return s; });
    }
  }

  // A closed rectangle over the bounds with a margin, cut to [a, b] along the axis.
  function rectShape(r, axis, span) {
    var pad = Math.max(r.width, r.height) * 0.02 + 2;
    var x0 = r.left - pad;
    var x1 = r.left + r.width + pad;
    var y0 = r.top - pad;
    var y1 = r.top + r.height + pad;
    var a, b, s;
    if (axis === 'x') {
      a = x0 + span[0] * (x1 - x0);
      b = x0 + span[1] * (x1 - x0);
      x0 = a;
      x1 = b;
    } else {
      a = y0 + span[0] * (y1 - y0);
      b = y0 + span[1] * (y1 - y0);
      y0 = a;
      y1 = b;
    }
    s = new Shape();
    s.vertices = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    s.closed = true;
    return s;
  }

  function mask(layer, t0, op, rect, rec) {
    var masks = sub(layer, 'ADBE Mask Parade');
    var m;
    if (!masks) {
      rec.skipped = 'masks';
      return false;
    }
    m = named(masks, op.name);
    if (!m) {
      masks.addProperty('ADBE Mask Atom').name = op.name;
      m = named(sub(layer, 'ADBE Mask Parade'), op.name);
      try { m.maskMode = MaskMode.ADD; } catch (e) { m = m || null; }
    }
    rec.keys += writeKeys(sub(m, 'ADBE Mask Shape'), t0, op.keys,
      function (v) { return rectShape(rect, op.axis, v); },
      function (d, s) { return s; });
    return true;
  }

  // A white solid of the comp's size right over the layer with Fractal Noise of the packs (Block, contrast 400,
  // brightness -100), the layer's Luma matte; setTrackMatte switches the matte's video off, as the interface does.
  function noiseMatte(comp, layer, op, rec) {
    var solid = comp.layers.addSolid([1, 1, 1], op.name + ' · ' + String(layer.name), comp.width, comp.height, comp.pixelAspect, comp.duration);
    var fx, set;
    solid.moveBefore(layer);
    fx = sub(solid, 'ADBE Effect Parade').addProperty('ADBE Fractal Noise');
    set = function (m, v) { sub(fx, m).setValue(v); };
    set('ADBE Fractal Noise-0001', 5);
    set('ADBE Fractal Noise-0002', 1);
    set('ADBE Fractal Noise-0004', 400);
    set('ADBE Fractal Noise-0005', -100);
    set('ADBE Fractal Noise-0006', 1);
    set('ADBE Fractal Noise-0010', op.scale);
    if (op.seed) {
      sub(fx, 'ADBE Fractal Noise-0027').expression = op.seed;
    }
    if (op.evolution) {
      sub(fx, 'ADBE Fractal Noise-0023').expression = op.evolution;
    }
    layer.setTrackMatte(solid, TrackMatteType.LUMA);
    rec.matte = String(solid.name);
  }

  function expression(layer, op, rec) {
    var list = propsByMatch(sub(layer, 'ADBE Root Vectors Group'), op.match, [], 0);
    var i;
    if (!list.length) {
      rec.skipped = 'repeater';
      return false;
    }
    for (i = 0; i < list.length; i++) {
      list[i].expression = op.expression;
    }
    rec.expressions = list.length;
    return true;
  }

  // The start of the i-th selected layer: its delay, or the stagger after the last delay.
  function startOf(req, i) {
    var d = req.delays || [];
    if (i < d.length) {
      return d[i];
    }
    return (d.length ? d[d.length - 1] + (i - d.length + 1) * req.stagger : i * req.stagger);
  }

  function rigLayer(comp, layer, req, i, t0) {
    var rec = { name: String(layer.name), done: false, keys: 0 };
    var needsRect = false;
    var rect = null;
    var j, op;
    if (req.layers === 'text' && !isText(layer)) {
      rec.skipped = 'text';
      return rec;
    }
    if (req.layers === 'shape' && !isShape(layer)) {
      rec.skipped = 'shape';
      return rec;
    }
    for (j = 0; j < req.ops.length; j++) {
      needsRect = needsRect || req.ops[j].kind === 'mask' || req.ops[j].kind === 'textRise';
    }
    if (needsRect) {
      try { rect = layer.sourceRectAtTime(t0, false); } catch (e) { rect = null; }
      if (!rect || !(rect.width > 0) || !(rect.height > 0)) {
        rec.skipped = 'bounds';
        return rec;
      }
    }
    for (j = 0; j < req.ops.length; j++) {
      op = req.ops[j];
      if (op.kind === 'make3D') {
        if (!layer.threeDLayer) {
          layer.threeDLayer = true;
          rec.made3D = true;
        }
      } else if (op.kind === 'track') {
        track(layer, t0, op, i, rec);
      } else if (op.kind === 'textRise') {
        textRise(layer, t0, op, rect, rec);
      } else if (op.kind === 'mask') {
        if (!mask(layer, t0, op, rect, rec)) {
          return rec;
        }
      } else if (op.kind === 'noiseMatte') {
        noiseMatte(comp, layer, op, rec);
      } else if (op.kind === 'expression') {
        if (!expression(layer, op, rec)) {
          return rec;
        }
      }
    }
    rec.done = true;
    return rec;
  }

  A.applyRig = function (req) {
    var comp = targetComp(req.targetId);
    var sel = comp.selectedLayers;
    var layers = [];
    var out = { layers: [] };
    var t = comp.time;
    var i;
    if (!sel.length) {
      throw fail('NO_SELECTION', 'no layer selected');
    }
    for (i = 0; i < sel.length; i++) {
      layers.push(sel[i]);
    }
    layers.sort(function (a, b) { return a.index - b.index; });
    app.beginSuppressDialogs();
    try {
      app.beginUndoGroup(req.undoLabel || 'BrandKit');
      try {
        for (i = 0; i < layers.length; i++) {
          out.layers.push(rigLayer(comp, layers[i], req, i, t + startOf(req, i)));
        }
      } finally {
        app.endUndoGroup();
      }
    } finally {
      app.endSuppressDialogs(false);
    }
    return out;
  };
}());
