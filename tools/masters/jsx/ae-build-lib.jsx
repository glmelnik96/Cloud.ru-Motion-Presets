// Build primitives for master templates (ES3). Load after spikes/lib/check.jsx and spikes/lib/ae-project.jsx.
// Node resolves every number (tools/build/dump-keys.mjs); these helpers only put them into AE.
// Docs: https://ae-scripting.docsforadobe.dev/layer/layercollection/ (addShape, addText, addNull)
//       https://ae-scripting.docsforadobe.dev/property/property/ (setTemporalEaseAtKey, setPropertyParameters)
//       https://ae-scripting.docsforadobe.dev/layer/avlayer/ (setTrackMatte, AE 23.0+)
var BD_INTERP = {
  LINEAR: KeyframeInterpolationType.LINEAR,
  BEZIER: KeyframeInterpolationType.BEZIER,
  HOLD: KeyframeInterpolationType.HOLD
};

function bdRgb(hex) {
  var n = parseInt(String(hex).replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function bdRgba(hex) {
  var c = bdRgb(hex);
  return [c[0], c[1], c[2], 1];
}

// ae-quirks #159: startTime, then inPoint, then outPoint.
function bdSpan(L, d, inPoint) {
  L.startTime = 0;
  L.inPoint = inPoint || 0;
  L.outPoint = d;
}

function bdXform(L, matchName) {
  return L.property('ADBE Transform Group').property(matchName);
}

// A neutral transform: anchor and position at the origin, so shape items and text are placed in comp
// coordinates (variants change the comp size, and expressions read thisComp.width/height).
function bdNeutral(L) {
  bdXform(L, 'ADBE Anchor Point').setValue(L.threeDLayer ? [0, 0, 0] : [0, 0]);
  bdXform(L, 'ADBE Position').setValue(L.threeDLayer ? [0, 0, 0] : [0, 0]);
}

function bdAddEffect(L, matchName, name) {
  L.property('ADBE Effect Parade').addProperty(matchName);
  var parade = L.property('ADBE Effect Parade');      // re-resolve after addProperty (ae-quirks #3)
  parade.property(parade.numProperties).name = name;
  return bkEffect(L, name, matchName);
}

function bdSlider(L, name, value) {
  var fx = bdAddEffect(L, 'ADBE Slider Control', name);
  fx.property(1).setValue(value);
  return fx;
}

function bdCheckbox(L, name, value) {
  var fx = bdAddEffect(L, 'ADBE Checkbox Control', name);
  fx.property(1).setValue(value ? 1 : 0);
  return fx;
}

// AE 26.5 rebuilds the pseudo effect in setPropertyParameters (new "Pseudo/@@<id>" match name) and resets
// its name, so the ASCII name is set again afterwards (checked live 2026-10-02). Returns the item list read
// back through propertyParameters (AE 26.0+).
function bdDropdown(L, name, items, value) {
  var menu = bdAddEffect(L, 'ADBE Dropdown Control', name).property(1);
  if (menu.isDropdownEffect !== true) {
    throw new Error(name + ': property 1 is not a dropdown menu');
  }
  menu = menu.setPropertyParameters(items);
  menu.parentProperty.name = name;
  menu.setValue(value);
  var fx = bkEffect(L, name, 'ADBE Dropdown Control');
  var back = null;
  try {
    back = fx.property(1).propertyParameters;
  } catch (e) {
    back = null;
  }
  return { effect: fx, items: back };
}

function bdNull(comp, name) {
  var L = comp.layers.addNull(comp.duration);
  L.name = name;
  bdSpan(L, comp.duration);
  return L;
}

function bdShapeLayer(comp, name) {
  var L = comp.layers.addShape();
  L.name = name;
  bdSpan(L, comp.duration);
  bdNeutral(L);
  return L;
}

function bdGroup(L, groupName) {
  L.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
  var root = L.property('ADBE Root Vectors Group');
  root.property(root.numProperties).name = groupName;
  return root.property(root.numProperties);
}

// Adds a shape item to a named group and returns it fresh (earlier references are stale after addProperty).
function bdInGroup(L, groupName, matchName, itemName) {
  L.property('ADBE Root Vectors Group').property(groupName).property('ADBE Vectors Group').addProperty(matchName);
  var vecs = L.property('ADBE Root Vectors Group').property(groupName).property('ADBE Vectors Group');
  var item = vecs.property(vecs.numProperties);
  if (itemName) {
    item.name = itemName;
  }
  return item;
}

function bdGroupItem(L, groupName, itemName) {
  return L.property('ADBE Root Vectors Group').property(groupName).property('ADBE Vectors Group').property(itemName);
}

// A path from resolved subpath data { vertices, inTangents, outTangents, closed }.
function bdPath(L, groupName, sp, itemName) {
  var item = bdInGroup(L, groupName, 'ADBE Vector Shape - Group', itemName);
  var sh = new Shape();
  sh.vertices = sp.vertices;
  sh.inTangents = sp.inTangents;
  sh.outTangents = sp.outTangents;
  sh.closed = sp.closed;
  item.property('ADBE Vector Shape').setValue(sh);
  return item;
}

function bdRect(L, groupName, itemName) {
  var item = bdInGroup(L, groupName, 'ADBE Vector Shape - Rect', itemName);
  item.property('ADBE Vector Rect Roundness').setValue(0);
  return item;
}

function bdFill(L, groupName, hex, itemName) {
  var item = bdInGroup(L, groupName, 'ADBE Vector Graphic - Fill', itemName);
  item.property('ADBE Vector Fill Color').setValue(bdRgba(hex));
  return item;
}

// ae-quirks #9: set the text, then change the LIVE document and set it again. addText takes the alignment
// last used in the Paragraph panel, so justification is always set.
function bdText(comp, name, str, st) {
  var L = comp.layers.addText(str);
  L.name = name;
  var prop = bkSourceText(L);
  var doc = prop.value;
  doc.text = str;
  prop.setValue(doc);
  var live = prop.value;
  live.font = st.font;
  live.fontSize = st.size;
  live.applyFill = true;
  live.fillColor = bdRgb(st.fill);
  live.applyStroke = false;
  live.tracking = st.tracking || 0;
  live.baselineShift = 0;
  live.justification = st.justify === 'CENTER' ? ParagraphJustification.CENTER_JUSTIFY :
    (st.justify === 'RIGHT' ? ParagraphJustification.RIGHT_JUSTIFY : ParagraphJustification.LEFT_JUSTIFY);
  if (st.leading) {
    live.autoLeading = false;
    live.leading = st.leading;
  }
  prop.setValue(live);
  bdSpan(L, comp.duration);
  bdNeutral(L);
  return L;
}

// doc.font echoes any name (ae-quirks #80); fontObject.location shows a substitute (times.ttf, #187).
function bdFontInfo(L) {
  var doc = bkSourceText(L).value;
  var fo = null;
  try {
    fo = doc.fontObject;
  } catch (e) {
    fo = null;
  }
  return { font: String(doc.font), size: doc.fontSize, file: fo ? String(fo.location) : '' };
}

function bdEase(list) {
  var out = [];
  for (var i = 0; i < list.length; i++) {
    out.push(new KeyframeEase(list[i][0], list[i][1]));
  }
  return out;
}

// Keys in the builder format { t, v, inType, outType, inEase, outEase } (tools/build/dump-keys.mjs).
// Interpolation first, then ease: AE ignores ease on non-Bezier sides.
function bdKeys(prop, keys) {
  var i;
  for (i = 0; i < keys.length; i++) {
    prop.setValueAtTime(keys[i].t, keys[i].v);
  }
  for (i = 0; i < keys.length; i++) {
    var idx = prop.nearestKeyIndex(keys[i].t);
    prop.setInterpolationTypeAtKey(idx, BD_INTERP[keys[i].inType], BD_INTERP[keys[i].outType]);
    if (keys[i].inType === 'BEZIER' || keys[i].outType === 'BEZIER') {
      prop.setTemporalEaseAtKey(idx, bdEase(keys[i].inEase), bdEase(keys[i].outEase));
    }
  }
  return prop.numKeys;
}

function bdKeyDump(prop) {
  var out = [];
  for (var k = 1; k <= prop.numKeys; k++) {
    var ie = prop.keyInTemporalEase(k);
    var oe = prop.keyOutTemporalEase(k);
    out.push({ t: prop.keyTime(k), v: prop.keyValue(k), inInf: ie[0].influence, outInf: oe[0].influence,
      inSpeed: ie[0].speed, outSpeed: oe[0].speed });
  }
  return out;
}

// Sets an expression, evaluates it once and returns expressionError ('' when fine).
function bdExpr(prop, src) {
  prop.expression = src;
  prop.valueAtTime(0, false);
  return prop.expressionError;
}

// AE 23.0+: any layer can be the matte, and it stays visible (both plates of the logoshot are visible
// and are mattes at the same time, as in the pack).
function bdMatte(L, matte, type) {
  L.setTrackMatte(matte, type === 'ALPHA_INVERTED' ? TrackMatteType.ALPHA_INVERTED : TrackMatteType.ALPHA);
  return { layer: L.name, matte: L.trackMatteLayer ? L.trackMatteLayer.name : null, type: String(L.trackMatteType) };
}

function bdMarkers(comp, markers) {
  var mk = comp.markerProperty;
  for (var i = 0; i < markers.length; i++) {
    var m = markers[i];
    var v = new MarkerValue(m.comment);
    v.duration = m.duration;
    v.protectedRegion = m.protectedRegion !== false;
    mk.setValueAtTime(m.time, v);
  }
  return bkMarkers(comp);
}

function bdClassic3d(comp) {
  var list = comp.renderers;
  for (var i = 0; i < list.length; i++) {
    if (list[i] === 'ADBE Advanced 3d') {
      comp.renderer = 'ADBE Advanced 3d';
    }
  }
  return comp.renderer;
}

// Every expression of a comp evaluated at the given times; returns the errors.
function bdExprSweep(comp, times) {
  var list = bkExpressionProps(comp);
  var bad = [];
  for (var i = 0; i < list.length; i++) {
    var p = bkResolve(comp, list[i]);
    if (p.expressionEnabled !== true) {
      bad.push(list[i].label + ': disabled');      // AE disables an expression that failed once
      continue;
    }
    for (var t = 0; t < times.length; t++) {
      p.valueAtTime(times[t], false);
      if (p.expressionError !== '') {
        bad.push(list[i].label + ' @' + times[t] + ': ' + p.expressionError);
        break;
      }
    }
  }
  return { count: list.length, errors: bad };
}
