// Read-only JSX dump of an After Effects project (ES3). Spec 3.2 "JSX-dump".
// tools/dump/dump.mjs prepends `var PARAMS = {...};` and runs one op per call:
//   { op: 'open', project, out }               open the project (refused when the current one has
//                                              unsaved changes), write the item inventory to `out`,
//                                              return the comp list
//   { op: 'comp', project, compId, out, caps } dump one comp of the open project into `out`;
//                                              caps: maxKeys, maxVertices, maxText, maxExpr, evalExpressions (1/0)
//   { op: 'close', project }                   close that project without saving
// Never renders, never saves. Every host read is guarded: a failed read is recorded, never thrown.
// Everything lives in one closure: only PARAMS and CRBK_DUMP become globals of the shared engine.
// API reference: https://ae-scripting.docsforadobe.dev/

var CRBK_DUMP = (function () {
  var DUMP_SCHEMA = 'crbk-dump/1';
  var DEFAULT_CAPS = { maxKeys: 1000, maxVertices: 5000, maxText: 20000, maxExpr: 50000, evalExpressions: 1 };

  function rd(obj, key) {
    try {
      return obj[key];
    } catch (e) {
      return undefined;
    }
  }

  function num(x) {
    if (typeof x !== 'number' || !isFinite(x)) { return x; }
    return Math.round(x * 1000000) / 1000000;
  }

  function nums(a) {
    var out = [], i;
    if (!(a instanceof Array)) { return num(a); }
    for (i = 0; i < a.length; i++) { out.push(a[i] instanceof Array ? nums(a[i]) : num(a[i])); }
    return out;
  }

  // Enum value -> name. The enums are AE globals; typeof keeps a missing one from throwing.
  function enumMap(en, names) {
    var m = {}, i, v;
    if (en === undefined || en === null) { return m; }
    for (i = 0; i < names.length; i++) {
      try { v = en[names[i]]; } catch (e) { v = undefined; }
      if (v !== undefined) { m[String(v)] = names[i]; }
    }
    return m;
  }

  function enumName(map, v) {
    var s;
    if (v === undefined || v === null) { return v; }
    s = map[String(v)];
    return s === undefined ? String(v) : s;
  }

  var E = {
    // https://ae-scripting.docsforadobe.dev/property/property/#propertypropertyvaluetype
    pvt: enumMap(typeof PropertyValueType === 'undefined' ? undefined : PropertyValueType,
      ['NO_VALUE', 'ThreeD_SPATIAL', 'ThreeD', 'TwoD_SPATIAL', 'TwoD', 'OneD', 'COLOR', 'CUSTOM_VALUE',
        'MARKER', 'LAYER_INDEX', 'MASK_INDEX', 'SHAPE', 'TEXT_DOCUMENT']),
    ptype: enumMap(typeof PropertyType === 'undefined' ? undefined : PropertyType,
      ['PROPERTY', 'INDEXED_GROUP', 'NAMED_GROUP']),
    kit: enumMap(typeof KeyframeInterpolationType === 'undefined' ? undefined : KeyframeInterpolationType,
      ['LINEAR', 'BEZIER', 'HOLD']),
    // https://ae-scripting.docsforadobe.dev/layer/avlayer/#avlayerblendingmode
    blend: enumMap(typeof BlendingMode === 'undefined' ? undefined : BlendingMode,
      ['NORMAL', 'DISSOLVE', 'DANCING_DISSOLVE', 'DARKEN', 'MULTIPLY', 'COLOR_BURN', 'CLASSIC_COLOR_BURN',
        'LINEAR_BURN', 'DARKER_COLOR', 'ADD', 'LIGHTEN', 'SCREEN', 'COLOR_DODGE', 'CLASSIC_COLOR_DODGE',
        'LINEAR_DODGE', 'LIGHTER_COLOR', 'OVERLAY', 'SOFT_LIGHT', 'HARD_LIGHT', 'LINEAR_LIGHT', 'VIVID_LIGHT',
        'PIN_LIGHT', 'HARD_MIX', 'DIFFERENCE', 'CLASSIC_DIFFERENCE', 'EXCLUSION', 'SUBTRACT', 'DIVIDE', 'HUE',
        'SATURATION', 'COLOR', 'LUMINOSITY', 'STENCIL_ALPHA', 'STENCIL_LUMA', 'SILHOUETE_ALPHA',
        'SILHOUETTE_LUMA', 'ALPHA_ADD', 'LUMINESCENT_PREMUL']),
    matte: enumMap(typeof TrackMatteType === 'undefined' ? undefined : TrackMatteType,
      ['ALPHA', 'ALPHA_INVERTED', 'LUMA', 'LUMA_INVERTED', 'NO_TRACK_MATTE']),
    maskMode: enumMap(typeof MaskMode === 'undefined' ? undefined : MaskMode,
      ['NONE', 'ADD', 'SUBTRACT', 'INTERSECT', 'LIGHTEN', 'DARKEN', 'DIFFERENCE']),
    maskFalloff: enumMap(typeof MaskFeatherFalloff === 'undefined' ? undefined : MaskFeatherFalloff,
      ['FFO_LINEAR', 'FFO_SMOOTH']),
    maskBlur: enumMap(typeof MaskMotionBlur === 'undefined' ? undefined : MaskMotionBlur,
      ['SAME_AS_LAYER', 'ON', 'OFF']),
    quality: enumMap(typeof LayerQuality === 'undefined' ? undefined : LayerQuality,
      ['BEST', 'DRAFT', 'WIREFRAME']),
    sampling: enumMap(typeof LayerSamplingQuality === 'undefined' ? undefined : LayerSamplingQuality,
      ['BICUBIC', 'BILINEAR']),
    fbt: enumMap(typeof FrameBlendingType === 'undefined' ? undefined : FrameBlendingType,
      ['FRAME_MIX', 'NO_FRAME_BLEND', 'PIXEL_MOTION']),
    orient: enumMap(typeof AutoOrientType === 'undefined' ? undefined : AutoOrientType,
      ['ALONG_PATH', 'CAMERA_OR_POINT_OF_INTEREST', 'CHARACTERS_TOWARD_CAMERA', 'NO_AUTO_ORIENT']),
    // https://ae-scripting.docsforadobe.dev/text/textdocument/#textdocumentjustification
    just: enumMap(typeof ParagraphJustification === 'undefined' ? undefined : ParagraphJustification,
      ['LEFT_JUSTIFY', 'RIGHT_JUSTIFY', 'CENTER_JUSTIFY', 'FULL_JUSTIFY_LASTLINE_LEFT',
        'FULL_JUSTIFY_LASTLINE_RIGHT', 'FULL_JUSTIFY_LASTLINE_CENTER', 'FULL_JUSTIFY_LASTLINE_FULL',
        'MULTIPLE_JUSTIFICATIONS'])
  };

  function capText(s, max, path, ctx) {
    if (typeof s !== 'string' || s.length <= max) { return s; }
    ctx.truncated.push({ path: path, what: 'text', count: s.length });
    return s.substring(0, max);
  }

  function mergeCaps(caps) {
    var out = {}, k;
    for (k in DEFAULT_CAPS) {
      if (DEFAULT_CAPS.hasOwnProperty(k)) {
        out[k] = (caps && typeof caps[k] === 'number') ? caps[k] : DEFAULT_CAPS[k];
      }
    }
    return out;
  }

  function normPath(p) {
    var s = String(p || '').replace(/\\/g, '/');
    if (String($.os).toLowerCase().search('windows') !== -1) { s = s.toLowerCase(); }
    return s;
  }

  function projectPath() {
    var f = null;
    try { f = app.project ? app.project.file : null; } catch (e) { f = null; }
    return f ? f.fsName : '';
  }

  function folderPath(item) {
    var parts = [], f = rd(item, 'parentFolder'), root = app.project.rootFolder, guard = 0;
    while (f && f.id !== root.id && guard < 100) {
      parts.unshift(f.name);
      f = rd(f, 'parentFolder');
      guard += 1;
    }
    return parts.join('/');
  }

  function writeText(path, text) {
    var f = new File(path), ok;
    f.encoding = 'UTF-8';
    f.lineFeed = 'Unix';
    if (!f.open('w')) { throw new Error('cannot write ' + path + ': ' + f.error); }
    ok = f.write(text);
    f.close();
    if (!ok) { throw new Error('write failed ' + path + ': ' + f.error); }
    return text.length;
  }

  // https://ae-scripting.docsforadobe.dev/other/markervalue/ (label, protectedRegion: AE 16.0+)
  function markerList(mp) {
    var out = [], k, mv, m;
    if (!mp) { return out; }
    for (k = 1; k <= mp.numKeys; k++) {
      mv = mp.keyValue(k);
      m = {
        time: num(mp.keyTime(k)), comment: rd(mv, 'comment'), duration: num(rd(mv, 'duration')),
        chapter: rd(mv, 'chapter'), url: rd(mv, 'url'), frameTarget: rd(mv, 'frameTarget'),
        cuePointName: rd(mv, 'cuePointName'), eventCuePoint: rd(mv, 'eventCuePoint'),
        label: rd(mv, 'label'), protectedRegion: rd(mv, 'protectedRegion')
      };
      try { m.params = mv.getParameters(); } catch (e) { m.params = null; }
      out.push(m);
    }
    return out;
  }

  // https://ae-scripting.docsforadobe.dev/text/textdocument/ : fillColor and strokeColor throw unless
  // applyFill / applyStroke; boxTextSize and boxTextPos throw unless boxText.
  function textDoc(d, path, ctx) {
    var o = {}, fo;
    if (!d) { return null; }
    o.text = capText(rd(d, 'text'), ctx.caps.maxText, path, ctx);
    o.font = rd(d, 'font');
    o.fontSize = num(rd(d, 'fontSize'));
    o.applyFill = rd(d, 'applyFill');
    o.applyStroke = rd(d, 'applyStroke');
    if (o.applyFill === true) { o.fillColor = nums(rd(d, 'fillColor')); }
    if (o.applyStroke === true) {
      o.strokeColor = nums(rd(d, 'strokeColor'));
      o.strokeWidth = num(rd(d, 'strokeWidth'));
      o.strokeOverFill = rd(d, 'strokeOverFill');
    }
    o.tracking = num(rd(d, 'tracking'));
    o.autoLeading = rd(d, 'autoLeading');
    o.leading = num(rd(d, 'leading'));
    o.justification = enumName(E.just, rd(d, 'justification'));
    o.boxText = rd(d, 'boxText');
    o.pointText = rd(d, 'pointText');
    if (o.boxText === true) {
      o.boxTextSize = nums(rd(d, 'boxTextSize'));
      o.boxTextPos = nums(rd(d, 'boxTextPos'));
    }
    o.baselineShift = num(rd(d, 'baselineShift'));
    o.fauxBold = rd(d, 'fauxBold');
    o.fauxItalic = rd(d, 'fauxItalic');
    o.allCaps = rd(d, 'allCaps');
    o.smallCaps = rd(d, 'smallCaps');
    o.horizontalScale = num(rd(d, 'horizontalScale'));
    o.verticalScale = num(rd(d, 'verticalScale'));
    o.fontFamily = rd(d, 'fontFamily');
    o.fontStyle = rd(d, 'fontStyle');
    o.fontLocation = rd(d, 'fontLocation');
    // https://ae-scripting.docsforadobe.dev/text/fontobject/ (AE 24.0+)
    fo = rd(d, 'fontObject');
    if (fo) {
      o.fontObject = {
        postScriptName: rd(fo, 'postScriptName'), familyName: rd(fo, 'familyName'), styleName: rd(fo, 'styleName'),
        version: rd(fo, 'version'), location: rd(fo, 'location'), isSubstitute: rd(fo, 'isSubstitute')
      };
    }
    return o;
  }

  // https://ae-scripting.docsforadobe.dev/other/shape/ : tangents are relative to their vertex.
  function shapeVal(s, path, ctx) {
    var o = {}, n, fsl;
    if (!s) { return null; }
    o.closed = rd(s, 'closed');
    n = s.vertices ? s.vertices.length : 0;
    o.count = n;
    if (n > ctx.caps.maxVertices) {
      ctx.truncated.push({ path: path, what: 'vertices', count: n });
      o.skipped = true;
      return o;
    }
    o.vertices = nums(s.vertices);
    o.inTangents = nums(s.inTangents);
    o.outTangents = nums(s.outTangents);
    fsl = rd(s, 'featherSegLocs');
    if (fsl && fsl.length) {
      o.feather = {
        segLocs: nums(fsl), relSegLocs: nums(rd(s, 'featherRelSegLocs')), radii: nums(rd(s, 'featherRadii')),
        interps: nums(rd(s, 'featherInterps')), tensions: nums(rd(s, 'featherTensions')),
        types: nums(rd(s, 'featherTypes')), relCornerAngles: nums(rd(s, 'featherRelCornerAngles'))
      };
    }
    return o;
  }

  function serValue(v, pvt, path, ctx) {
    if (v === undefined || v === null) { return null; }
    if (pvt === 'TEXT_DOCUMENT') { return textDoc(v, path, ctx); }
    if (pvt === 'SHAPE') { return shapeVal(v, path, ctx); }
    if (v instanceof Array) { return nums(v); }
    if (typeof v === 'number') { return num(v); }
    if (typeof v === 'boolean' || typeof v === 'string') { return v; }
    return String(v);
  }

  function easeList(list) {
    var out = [], i;
    if (!list) { return out; }
    for (i = 0; i < list.length; i++) {
      out.push({ speed: num(list[i].speed), influence: num(list[i].influence) });
    }
    return out;
  }

  // https://ae-scripting.docsforadobe.dev/property/property/ : keyTime is in comp time; spatial
  // tangents, spatial continuity and roving throw unless the property is TwoD_SPATIAL/ThreeD_SPATIAL.
  function keyInfo(p, k, pvt, path, ctx) {
    var key = { time: num(p.keyTime(k)) };
    var spatial = (pvt === 'TwoD_SPATIAL' || pvt === 'ThreeD_SPATIAL');
    if (pvt !== 'CUSTOM_VALUE') {
      try { key.value = serValue(p.keyValue(k), pvt, path + '@' + k, ctx); } catch (e0) { key.valueError = String(e0); }
    }
    try { key.inInterp = enumName(E.kit, p.keyInInterpolationType(k)); } catch (e1) { key.inInterp = null; }
    try { key.outInterp = enumName(E.kit, p.keyOutInterpolationType(k)); } catch (e2) { key.outInterp = null; }
    try { key.inEase = easeList(p.keyInTemporalEase(k)); } catch (e3) { key.inEase = null; }
    try { key.outEase = easeList(p.keyOutTemporalEase(k)); } catch (e4) { key.outEase = null; }
    try { key.temporalContinuous = p.keyTemporalContinuous(k); } catch (e5) { key.temporalContinuous = null; }
    try { key.temporalAutoBezier = p.keyTemporalAutoBezier(k); } catch (e6) { key.temporalAutoBezier = null; }
    if (spatial) {
      try { key.inSpatial = nums(p.keyInSpatialTangent(k)); } catch (e7) { key.inSpatial = null; }
      try { key.outSpatial = nums(p.keyOutSpatialTangent(k)); } catch (e8) { key.outSpatial = null; }
      try { key.spatialContinuous = p.keySpatialContinuous(k); } catch (e9) { key.spatialContinuous = null; }
      try { key.spatialAutoBezier = p.keySpatialAutoBezier(k); } catch (e10) { key.spatialAutoBezier = null; }
      try { key.roving = p.keyRoving(k); } catch (e11) { key.roving = null; }
    }
    try { key.label = p.keyLabel(k); } catch (e12) { key.label = null; }
    return key;
  }

  // One node of the property tree: groups carry children, properties carry value or keys.
  function propNode(p, path, ctx) {
    var node = { matchName: rd(p, 'matchName'), name: rd(p, 'name') };
    var kind, pvt, i, n, child, nk, k, last, expr;
    ctx.stats.props += 1;
    node.index = rd(p, 'propertyIndex');
    kind = enumName(E.ptype, rd(p, 'propertyType'));
    if (rd(p, 'canSetEnabled') === true) { node.enabled = rd(p, 'enabled'); }
    if (kind === 'INDEXED_GROUP' || kind === 'NAMED_GROUP') {
      node.group = kind;
      node.children = [];
      n = rd(p, 'numProperties') || 0;
      for (i = 1; i <= n; i++) {
        try {
          child = p.property(i);
          node.children.push(propNode(child, path + '/' + child.matchName, ctx));
        } catch (e0) {
          node.children.push({ index: i, error: String(e0) });
        }
      }
      return node;
    }
    pvt = enumName(E.pvt, rd(p, 'propertyValueType'));
    node.pvt = pvt;
    if (pvt === 'NO_VALUE') { return node; }
    node.modified = rd(p, 'isModified');
    if (rd(p, 'isSeparationLeader') === true) { node.dimensionsSeparated = rd(p, 'dimensionsSeparated'); }
    if (rd(p, 'isSeparationFollower') === true) { node.separationDimension = rd(p, 'separationDimension'); }
    if (rd(p, 'canSetExpression') === true) {
      expr = rd(p, 'expression');
      if (typeof expr === 'string' && expr !== '') {
        ctx.stats.expressions += 1;
        node.expression = { text: capText(expr, ctx.caps.maxExpr, path, ctx), enabled: rd(p, 'expressionEnabled') };
        if (node.expression.enabled === true && ctx.caps.evalExpressions !== 0) {
          // One evaluation fills expressionError even if nothing has rendered this comp since the open.
          // valueAtTime(t, false) applies the expression; AE 16+ no longer disables an expression that fails.
          try {
            node.expression.valueAt0 = serValue(p.valueAtTime(0, false), pvt, path + '#expr', ctx);
          } catch (eX) {
            node.expression.evalError = String(eX);
          }
        }
        node.expression.error = rd(p, 'expressionError') || '';
        if (node.expression.error !== '') { ctx.stats.expressionErrors += 1; }
      }
    }
    if (pvt === 'CUSTOM_VALUE') { node.custom = true; }
    nk = rd(p, 'numKeys') || 0;
    if (nk > 0) {
      last = nk;
      if (nk > ctx.caps.maxKeys) {
        last = ctx.caps.maxKeys;
        node.keysTotal = nk;
        ctx.truncated.push({ path: path, what: 'keys', count: nk });
      }
      node.keys = [];
      for (k = 1; k <= last; k++) {
        try { node.keys.push(keyInfo(p, k, pvt, path, ctx)); } catch (e1) { node.keys.push({ error: String(e1) }); }
      }
      ctx.stats.keys += node.keys.length;
    } else if (pvt !== 'CUSTOM_VALUE') {
      // Pre-expression static value: valueAtTime(t, true) does not apply the expression.
      try { node.value = serValue(p.valueAtTime(0, true), pvt, path, ctx); } catch (e2) { node.valueError = String(e2); }
    }
    return node;
  }

  function effectList(L, ctx) {
    var parade = null, out = [], i, fx, node;
    try { parade = L.property('ADBE Effect Parade'); } catch (e0) { parade = null; }
    if (!parade) { return out; }
    for (i = 1; i <= parade.numProperties; i++) {
      try {
        fx = parade.property(i);
        node = propNode(fx, 'L' + L.index + '/fx' + i, ctx);
        out.push({ index: i, matchName: node.matchName, name: node.name, enabled: rd(fx, 'enabled'), params: node.children || [] });
      } catch (e1) {
        out.push({ index: i, error: String(e1), params: [] });
      }
    }
    return out;
  }

  var MASK_FIELDS = { 'ADBE Mask Shape': 'path', 'ADBE Mask Feather': 'feather', 'ADBE Mask Opacity': 'opacity', 'ADBE Mask Offset': 'expansion' };

  // https://ae-scripting.docsforadobe.dev/property/maskpropertygroup/
  function maskList(L, ctx) {
    var parade = null, out = [], i, j, m, node, rec, c, field;
    try { parade = L.property('ADBE Mask Parade'); } catch (e0) { parade = null; }
    if (!parade) { return out; }
    for (i = 1; i <= parade.numProperties; i++) {
      try {
        m = parade.property(i);
        node = propNode(m, 'L' + L.index + '/mask' + i, ctx);
      } catch (e1) {
        out.push({ index: i, error: String(e1), other: [] });
        continue;
      }
      rec = {
        index: i, name: node.name, mode: enumName(E.maskMode, rd(m, 'maskMode')), inverted: rd(m, 'inverted'),
        locked: rd(m, 'locked'), rotoBezier: rd(m, 'rotoBezier'),
        featherFalloff: enumName(E.maskFalloff, rd(m, 'maskFeatherFalloff')),
        motionBlur: enumName(E.maskBlur, rd(m, 'maskMotionBlur')), color: nums(rd(m, 'color')), other: []
      };
      for (j = 0; node.children && j < node.children.length; j++) {
        c = node.children[j];
        field = MASK_FIELDS[c.matchName];
        if (field) { rec[field] = c; } else { rec.other.push(c); }
      }
      out.push(rec);
    }
    return out;
  }

  // AE 23.0+: trackMatteLayer can be any layer; before that the matte is the layer directly above.
  // https://ae-scripting.docsforadobe.dev/layer/avlayer/#avlayertrackmattelayer
  function trackMatte(L) {
    var t = rd(L, 'trackMatteType'), o, ml, modern = false;
    if (t === undefined || t === null) { return null; }
    o = { type: enumName(E.matte, t), hasTrackMatte: rd(L, 'hasTrackMatte'), isTrackMatte: rd(L, 'isTrackMatte') };
    try { modern = (typeof L.trackMatteLayer !== 'undefined'); } catch (e0) { modern = false; }
    if (modern) {
      ml = rd(L, 'trackMatteLayer');
      o.layer = ml ? ml.index : null;
      o.api = 'trackMatteLayer';
    } else {
      o.layer = (o.type !== 'NO_TRACK_MATTE' && L.index > 1) ? L.index - 1 : null;
      o.api = 'legacy';
    }
    return o;
  }

  // https://ae-scripting.docsforadobe.dev/sources/filesource/ : a missing file reports missingFootagePath.
  function sourceInfo(src) {
    var o, ms;
    if (!src) { return null; }
    o = {
      id: rd(src, 'id'), name: rd(src, 'name'), width: rd(src, 'width'), height: rd(src, 'height'),
      pixelAspect: num(rd(src, 'pixelAspect')), frameRate: num(rd(src, 'frameRate')), duration: num(rd(src, 'duration')),
      hasVideo: rd(src, 'hasVideo'), hasAudio: rd(src, 'hasAudio'), missing: rd(src, 'footageMissing')
    };
    if (src instanceof CompItem) { o.kind = 'comp'; return o; }
    ms = rd(src, 'mainSource');
    if (!ms) { o.kind = 'other'; return o; }
    if (typeof SolidSource !== 'undefined' && ms instanceof SolidSource) {
      o.kind = 'solid';
      o.color = nums(rd(ms, 'color'));
      return o;
    }
    if (typeof PlaceholderSource !== 'undefined' && ms instanceof PlaceholderSource) { o.kind = 'placeholder'; return o; }
    o.kind = 'file';
    o.isStill = rd(ms, 'isStill');
    o.loop = rd(ms, 'loop');
    o.hasAlpha = rd(ms, 'hasAlpha');
    o.nativeFrameRate = num(rd(ms, 'nativeFrameRate'));
    o.conformFrameRate = num(rd(ms, 'conformFrameRate'));
    if (o.missing === true) {
      o.file = rd(ms, 'missingFootagePath');
    } else {
      try { o.file = ms.file ? ms.file.fsName : null; } catch (e0) { o.file = null; }
    }
    return o;
  }

  function layerType(L) {
    if (typeof CameraLayer !== 'undefined' && L instanceof CameraLayer) { return 'camera'; }
    if (typeof LightLayer !== 'undefined' && L instanceof LightLayer) { return 'light'; }
    if (typeof TextLayer !== 'undefined' && L instanceof TextLayer) { return 'text'; }
    if (typeof ShapeLayer !== 'undefined' && L instanceof ShapeLayer) { return 'shape'; }
    if (rd(L, 'nullLayer') === true) { return 'null'; }
    if (rd(L, 'adjustmentLayer') === true) { return 'adjustment'; }
    return 'av';
  }

  var TOP_SKIP = { 'ADBE Marker': true, 'ADBE Effect Parade': true, 'ADBE Mask Parade': true };

  function layerNode(L, ctx) {
    var par = rd(L, 'parent'), o, i, n, child, mn;
    o = {
      index: L.index, id: rd(L, 'id'), name: rd(L, 'name'), isNameSet: rd(L, 'isNameSet'), type: layerType(L),
      matchName: rd(L, 'matchName'), comment: rd(L, 'comment'), label: rd(L, 'label'),
      inPoint: num(rd(L, 'inPoint')), outPoint: num(rd(L, 'outPoint')), startTime: num(rd(L, 'startTime')),
      stretch: num(rd(L, 'stretch')), parent: par ? par.index : null,
      blendingMode: enumName(E.blend, rd(L, 'blendingMode')), trackMatte: trackMatte(L),
      source: sourceInfo(rd(L, 'source'))
    };
    o.switches = {
      enabled: rd(L, 'enabled'), solo: rd(L, 'solo'), shy: rd(L, 'shy'), locked: rd(L, 'locked'),
      threeDLayer: rd(L, 'threeDLayer'), threeDPerChar: rd(L, 'threeDPerChar'), motionBlur: rd(L, 'motionBlur'),
      collapseTransformation: rd(L, 'collapseTransformation'), adjustmentLayer: rd(L, 'adjustmentLayer'),
      guideLayer: rd(L, 'guideLayer'), effectsActive: rd(L, 'effectsActive'), frameBlending: rd(L, 'frameBlending'),
      frameBlendingType: enumName(E.fbt, rd(L, 'frameBlendingType')), timeRemapEnabled: rd(L, 'timeRemapEnabled'),
      audioEnabled: rd(L, 'audioEnabled'), hasVideo: rd(L, 'hasVideo'), hasAudio: rd(L, 'hasAudio'),
      environmentLayer: rd(L, 'environmentLayer'), preserveTransparency: rd(L, 'preserveTransparency'),
      quality: enumName(E.quality, rd(L, 'quality')), samplingQuality: enumName(E.sampling, rd(L, 'samplingQuality')),
      autoOrient: enumName(E.orient, rd(L, 'autoOrient'))
    };
    try { o.markers = markerList(L.property('ADBE Marker')); } catch (e0) { o.markers = []; }
    o.effects = effectList(L, ctx);
    o.masks = maskList(L, ctx);
    o.props = [];
    n = rd(L, 'numProperties') || 0;
    for (i = 1; i <= n; i++) {
      try {
        child = L.property(i);
        mn = child.matchName;
        if (TOP_SKIP[mn] !== true) { o.props.push(propNode(child, 'L' + L.index + '/' + mn, ctx)); }
      } catch (e1) {
        o.props.push({ index: i, error: String(e1) });
      }
    }
    return o;
  }

  // https://ae-scripting.docsforadobe.dev/item/compitem/
  function compNode(c) {
    var o, used, j;
    o = {
      id: c.id, name: c.name, folder: folderPath(c), comment: rd(c, 'comment'), label: rd(c, 'label'),
      width: rd(c, 'width'), height: rd(c, 'height'), pixelAspect: num(rd(c, 'pixelAspect')),
      frameRate: num(rd(c, 'frameRate')), frameDuration: num(rd(c, 'frameDuration')), duration: num(rd(c, 'duration')),
      displayStartTime: num(rd(c, 'displayStartTime')), workAreaStart: num(rd(c, 'workAreaStart')),
      workAreaDuration: num(rd(c, 'workAreaDuration')), bgColor: nums(rd(c, 'bgColor')),
      renderer: rd(c, 'renderer'), renderers: rd(c, 'renderers'),
      motionBlur: rd(c, 'motionBlur'), shutterAngle: rd(c, 'shutterAngle'), shutterPhase: rd(c, 'shutterPhase'),
      motionBlurSamplesPerFrame: rd(c, 'motionBlurSamplesPerFrame'),
      motionBlurAdaptiveSampleLimit: rd(c, 'motionBlurAdaptiveSampleLimit'),
      frameBlending: rd(c, 'frameBlending'), preserveNestedFrameRate: rd(c, 'preserveNestedFrameRate'),
      preserveNestedResolution: rd(c, 'preserveNestedResolution'), draft3d: rd(c, 'draft3d'),
      hideShyLayers: rd(c, 'hideShyLayers'), dropFrame: rd(c, 'dropFrame'),
      resolutionFactor: nums(rd(c, 'resolutionFactor')), numLayers: rd(c, 'numLayers'),
      mgtName: rd(c, 'motionGraphicsTemplateName'), mgtControllerCount: rd(c, 'motionGraphicsTemplateControllerCount'),
      usedIn: []
    };
    used = rd(c, 'usedIn');
    for (j = 0; used && j < used.length; j++) { o.usedIn.push(used[j].id); }
    o.markers = markerList(rd(c, 'markerProperty'));
    return o;
  }

  function itemKind(it) {
    if (it instanceof CompItem) { return 'comp'; }
    if (it instanceof FolderItem) { return 'folder'; }
    if (it instanceof FootageItem) { return 'footage'; }
    return 'other';
  }

  // https://ae-scripting.docsforadobe.dev/general/project/#projectusedfonts (AE 24.5+)
  function usedFonts() {
    var list = null, out = [], i, f;
    try { list = app.project.usedFonts; } catch (e0) { list = null; }
    if (!list) { return null; }
    for (i = 0; i < list.length; i++) {
      f = list[i].font;
      out.push({
        postScriptName: rd(f, 'postScriptName'), familyName: rd(f, 'familyName'), styleName: rd(f, 'styleName'),
        version: rd(f, 'version'), location: rd(f, 'location'), isSubstitute: rd(f, 'isSubstitute'),
        uses: list[i].usedAt ? list[i].usedAt.length : 0
      });
    }
    return out;
  }

  function projectInventory() {
    var p = app.project, items = [], comps = [], missing = 0, i, it, kind, rec, used;
    for (i = 1; i <= p.numItems; i++) {
      it = p.item(i);
      kind = itemKind(it);
      rec = { id: it.id, name: it.name, kind: kind, folder: folderPath(it), comment: rd(it, 'comment'), label: rd(it, 'label') };
      if (kind === 'footage') {
        rec.source = sourceInfo(it);
        used = rd(it, 'usedIn');
        rec.usedInCount = used ? used.length : 0;
        if (rec.source && rec.source.missing === true) { missing += 1; }
      }
      if (kind === 'comp') {
        rec.width = rd(it, 'width');
        rec.height = rd(it, 'height');
        rec.frameRate = num(rd(it, 'frameRate'));
        rec.duration = num(rd(it, 'duration'));
        rec.numLayers = rd(it, 'numLayers');
        rec.renderer = rd(it, 'renderer');
        used = rd(it, 'usedIn');
        rec.usedInCount = used ? used.length : 0;
        comps.push({ id: it.id, name: it.name, folder: rec.folder, numLayers: rec.numLayers });
      }
      items.push(rec);
    }
    return {
      schema: DUMP_SCHEMA, file: projectPath(), aeVersion: String(app.version), language: rd(app, 'isoLanguage'),
      expressionEngine: rd(p, 'expressionEngine'), bitsPerChannel: rd(p, 'bitsPerChannel'),
      linearBlending: rd(p, 'linearBlending'), linearizeWorkingSpace: rd(p, 'linearizeWorkingSpace'),
      workingSpace: rd(p, 'workingSpace'), workingGamma: rd(p, 'workingGamma'),
      numItems: p.numItems, missingFootage: missing, comps: comps, items: items, fonts: usedFonts()
    };
  }

  // app.open with unsaved changes would raise a Save dialog (a modal blocks the bridge, quirk #25),
  // so a dirty project is refused. https://ae-scripting.docsforadobe.dev/general/project/#projectdirty
  function opOpen(P) {
    var t0 = new Date().getTime(), cur = projectPath(), f, proj = null, inv, bytes;
    if (app.project && rd(app.project, 'dirty') === true) {
      return { ok: false, error: { code: 'PROJECT_DIRTY', message: 'the open project has unsaved changes (' + cur + '); save or close it first' } };
    }
    if (normPath(cur) !== normPath(P.project)) {
      f = new File(P.project);
      if (!f.exists) { return { ok: false, error: { code: 'NO_PROJECT', message: 'not found: ' + P.project } }; }
      app.beginSuppressDialogs();
      try {
        proj = app.open(f);
      } finally {
        app.endSuppressDialogs(false);
      }
      if (!proj) { return { ok: false, error: { code: 'OPEN_FAILED', message: 'app.open returned null: ' + P.project } }; }
    }
    inv = projectInventory();
    bytes = writeText(P.out, JSON.stringify(inv));
    return {
      ok: true,
      data: {
        file: inv.file, aeVersion: inv.aeVersion, expressionEngine: inv.expressionEngine, numItems: inv.numItems,
        missingFootage: inv.missingFootage, comps: inv.comps, bytes: bytes, ms: new Date().getTime() - t0
      }
    };
  }

  function opComp(P) {
    var t0 = new Date().getTime(), c, ctx, out, i, bytes;
    if (normPath(projectPath()) !== normPath(P.project)) {
      return { ok: false, error: { code: 'WRONG_PROJECT', message: 'open project is ' + projectPath() + ', expected ' + P.project } };
    }
    c = app.project.itemByID(P.compId);
    if (!c || !(c instanceof CompItem)) {
      return { ok: false, error: { code: 'NO_COMP', message: 'no comp with id ' + P.compId } };
    }
    ctx = { caps: mergeCaps(P.caps), truncated: [], stats: { layers: 0, props: 0, keys: 0, expressions: 0, expressionErrors: 0 } };
    out = {
      schema: DUMP_SCHEMA,
      project: { file: projectPath(), aeVersion: String(app.version), expressionEngine: rd(app.project, 'expressionEngine') },
      comp: compNode(c),
      layers: []
    };
    // Evaluating expressions may raise script errors: keep their dialogs from blocking the bridge.
    app.beginSuppressDialogs();
    try {
      for (i = 1; i <= c.numLayers; i++) {
        try {
          out.layers.push(layerNode(c.layer(i), ctx));
        } catch (e0) {
          out.layers.push({ index: i, error: String(e0) });
        }
        ctx.stats.layers += 1;
      }
    } finally {
      app.endSuppressDialogs(false);
    }
    ctx.stats.ms = new Date().getTime() - t0;
    out.truncated = ctx.truncated;
    out.stats = ctx.stats;
    bytes = writeText(P.out, JSON.stringify(out));
    return { ok: true, data: { compId: c.id, name: c.name, bytes: bytes, stats: ctx.stats, truncated: ctx.truncated.length } };
  }

  function opClose(P) {
    if (normPath(projectPath()) !== normPath(P.project)) {
      return { ok: true, data: { closed: false, reason: 'not open: ' + P.project } };
    }
    // https://ae-scripting.docsforadobe.dev/general/project/#projectclose
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    return { ok: true, data: { closed: true } };
  }

  function dumpMain(P) {
    try {
      if (!P || !P.op) { return { ok: false, error: { code: 'BAD_PARAMS', message: 'PARAMS.op is required' } }; }
      if (P.op === 'open') { return opOpen(P); }
      if (P.op === 'comp') { return opComp(P); }
      if (P.op === 'close') { return opClose(P); }
      return { ok: false, error: { code: 'BAD_OP', message: 'unknown op: ' + P.op } };
    } catch (e) {
      return { ok: false, error: { code: 'HOST_EXCEPTION', message: String(e) + ((e && e.line) ? ' (line ' + e.line + ')' : '') } };
    }
  }

  return { main: dumpMain };
}());

JSON.stringify(CRBK_DUMP.main(PARAMS));
