/**
 * ExtendScript host entry point for the Cloud.ru Motion Presets panel.
 *
 * This file defines the bridge function that the CEP panel calls via CSInterface.evalScript.
 * It applies a given expression string to the currently selected property, when possible.
 */

//@target aftereffects

// ============================================================================
// Undo helpers.
// Each tool call gets its own undo group. The panel counts mutating
// tool calls and can batch-undo them via N × app.executeCommand(16).
// ============================================================================

/**
 * Begin an undo group for the current tool operation.
 */
function _beginToolUndo (label) {
  app.beginUndoGroup(label);
}

/**
 * End the current undo group.
 */
function _endToolUndo () {
  try { app.endUndoGroup(); } catch (e) {}
}

/**
 * Resolve the "active composition" in a defensive way.
 *
 * This accounts for cases where:
 * - app.project.activeItem is null
 * - app.project.activeItem is not a CompItem (e.g. Project panel selection)
 * - there is an active composition viewer whose comp differs from activeItem
 *
 * Returns a plain object (not JSON) with shape:
 * {
 *   ok: boolean,
 *   statusCode: string,      // e.g. 'NO_PROJECT', 'NO_COMP', 'COMP_FROM_ACTIVE_ITEM', 'COMP_FROM_VIEWER'
 *   message: string,
 *   compName: string,
 *   comp: CompItem|null,
 *   viewerType: string,      // best-effort description of active viewer type
 *   projectActiveItemType: string // best-effort description of app.project.activeItem
 * }
 */
function motionPresets_resolveActiveComp () {
  var ctx = {
    ok: false,
    statusCode: '',
    message: '',
    compName: '',
    comp: null,
    viewerType: '',
    projectActiveItemType: '',
  };

  if (!app || !app.project) {
    ctx.statusCode = 'NO_PROJECT';
    ctx.message = 'No active project in After Effects.';
    return ctx;
  }

  function isCompItem (item) {
    if (!item) return false;
    // Primary check: real CompItem instance.
    try {
      if (item instanceof CompItem) return true;
    } catch (e1) {}
    // Fallback structural check: comps have numLayers and layer().
    try {
      if (
        typeof item.numLayers === 'number' &&
        typeof item.layer === 'function'
      ) {
        return true;
      }
    } catch (e2) {}
    return false;
  }

  var activeItem = null;
  try {
    activeItem = app.project.activeItem;
  } catch (eActiveItem) {
    activeItem = null;
  }

  if (activeItem) {
    try {
      if (isCompItem(activeItem)) {
        ctx.projectActiveItemType = 'CompItem';
      } else {
        ctx.projectActiveItemType = '' + activeItem;
      }
    } catch (eType1) {
      ctx.projectActiveItemType = 'Unknown';
    }
  } else {
    ctx.projectActiveItemType = 'None';
  }

  var viewer = null;
  try {
    viewer = app.activeViewer;
  } catch (eViewer) {
    viewer = null;
  }

  var viewerType = '';
  if (viewer) {
    try {
      // In modern AE, viewer.type is a ViewerType enum; stringify it for diagnostics.
      viewerType = '' + viewer.type;
    } catch (eViewerType) {
      viewerType = 'Unknown';
    }
  } else {
    viewerType = 'None';
  }
  ctx.viewerType = viewerType;

  // 1) Prefer a real CompItem from app.project.activeItem when available.
  if (isCompItem(activeItem)) {
    ctx.ok = true;
    ctx.statusCode = 'COMP_FROM_ACTIVE_ITEM';
    ctx.comp = activeItem;
    ctx.compName = activeItem.name;
    ctx.message =
      'Active composition is "' +
      activeItem.name +
      '" (from project activeItem).';
    return ctx;
  }

  // 2) If activeItem is not a comp, but the active viewer is a composition viewer,
  //    activate it so that app.project.activeItem becomes the comp. When the user
  //    has clicked in the CEP panel, app.activeViewer is often null, so this may
  //    not run; we fall back in step 4.
  var isCompositionViewer = false;
  if (viewer) {
    try {
      if (typeof ViewerType !== 'undefined' && viewer.type === ViewerType.VIEWER_COMPOSITION) {
        isCompositionViewer = true;
      }
    } catch (eType) {}
    if (!isCompositionViewer && viewer.type !== undefined) {
      isCompositionViewer = String(viewer.type).indexOf('COMPOSITION') !== -1;
    }
    if (isCompositionViewer && typeof viewer.setActive === 'function') {
      try {
        viewer.setActive();
      } catch (eSetActive2) {}
      try {
        activeItem = app.project.activeItem;
      } catch (eActiveItem2) {
        activeItem = null;
      }
      if (isCompItem(activeItem)) {
        ctx.ok = true;
        ctx.statusCode = 'COMP_FROM_VIEWER';
        ctx.comp = activeItem;
        ctx.compName = activeItem.name;
        ctx.projectActiveItemType = 'CompItem';
        ctx.message =
          'Active composition is "' +
          activeItem.name +
          '" (from composition viewer).';
        return ctx;
      }
    }
  }

  // 3) No comp from activeItem or viewer; try first composition in project as fallback.
  //    This handles the case where the user has a comp open but the CEP panel has focus,
  //    so app.activeViewer is null and activeItem may not be the comp.
  var numItems = 0;
  try {
    numItems = app.project.numItems;
  } catch (eNum) {}
  for (var iProj = 1; iProj <= numItems; iProj++) {
    var item = null;
    try {
      item = app.project.item(iProj);
    } catch (eItem) {
      continue;
    }
    if (item && isCompItem(item)) {
      ctx.ok = true;
      ctx.statusCode = 'COMP_FROM_PROJECT_FALLBACK';
      ctx.comp = item;
      ctx.compName = item.name;
      ctx.message =
        'Using composition "' +
        item.name +
        '". To use a different comp: select it in the Project panel or click in its timeline, then press @ again.';
      return ctx;
    }
  }

  // 4) No usable composition found.
  if (!activeItem && !viewer) {
    ctx.statusCode = 'NO_ACTIVE_ITEM_OR_VIEWER';
    ctx.message =
      'No active composition and no composition in project. Open a comp and try again.';
    return ctx;
  }

  if (!activeItem && viewer) {
    ctx.statusCode = 'NO_ACTIVE_ITEM_VIEWER_NOT_COMP';
    ctx.message =
      'No active composition: the active viewer is not linked to a composition.';
    return ctx;
  }

  ctx.statusCode = 'ACTIVE_ITEM_NOT_COMP';
  ctx.message =
    'No active composition: the current project selection is not a composition in the timeline.';
  return ctx;
}

/**
 * Return a robust, UI-friendly active composition note payload.
 * Unlike strict tool operations, this is best-effort and falls back to the first
 * composition in the project when focus context is ambiguous.
 */
function motionPresets_getActiveCompNote () {
  var result = {
    ok: false,
    compName: '',
    source: '',
    message: ''
  };
  try {
    if (!app || !app.project) {
      result.message = 'No active project in After Effects.';
      return resultToJson(result);
    }

    var ctx = motionPresets_resolveActiveComp();
    if (ctx && ctx.ok && ctx.comp) {
      result.ok = true;
      result.compName = ctx.comp.name || '';
      result.source = ctx.statusCode || 'resolved';
      result.message = 'Active composition resolved.';
      return resultToJson(result);
    }

    // Defensive fallback for UI: first composition in project.
    var numItems = 0;
    try { numItems = app.project.numItems || 0; } catch (eNum) { numItems = 0; }
    for (var i = 1; i <= numItems; i++) {
      var it = null;
      try { it = app.project.item(i); } catch (eItem) { it = null; }
      if (!it) continue;
      var isComp = false;
      try {
        isComp = (it instanceof CompItem) ||
          (typeof it.numLayers === 'number' && typeof it.layer === 'function');
      } catch (eType) { isComp = false; }
      if (isComp) {
        result.ok = true;
        result.compName = it.name || '';
        result.source = 'project_fallback';
        result.message = 'Using first composition from project list.';
        return resultToJson(result);
      }
    }

    result.message = (ctx && ctx.message) ? ctx.message : 'No composition found.';
    return resultToJson(result);
  } catch (e) {
    result.message = 'getActiveCompNote error: ' + e.toString();
    return resultToJson(result);
  }
}

function motionPresets_getHostContext () {
  var result = {
    ok: false,
    message: '',
    compName: '',
    compStatusCode: '',
    viewerType: '',
    projectActiveItemType: '',
    time: null,
    workAreaStart: null,
    workAreaDuration: null,
    compDuration: null,
    fps: null,
    selectedLayers: [],
    selectedProperties: [],
  };

  try {
    var ctx = motionPresets_resolveActiveComp();
    result.compStatusCode = ctx.statusCode || '';
    result.viewerType = ctx.viewerType || '';
    result.projectActiveItemType = ctx.projectActiveItemType || '';

    if (!ctx.ok || !ctx.comp) {
      result.message = ctx.message || 'No active composition.';
      return resultToJson(result);
    }

    var comp = ctx.comp;
    result.ok = true;
    result.compName = comp.name;
    result.message = 'Host context OK.';
    try {
      result.time = comp.time;
    } catch (eT) {
      result.time = null;
    }
    try {
      result.workAreaStart = comp.workAreaStart;
      result.workAreaDuration = comp.workAreaDuration;
      result.compDuration = comp.duration;
      result.fps = comp.frameRate;
    } catch (eW) {}

    var i;
    for (i = 1; i <= comp.numLayers; i++) {
      try {
        var lyr = comp.layer(i);
        if (!lyr) continue;
        if (lyr.selected === true) {
          result.selectedLayers.push({
            index: lyr.index,
            id: lyr.id,
            name: lyr.name,
            matchName: lyr.matchName || '',
          });
        }
      } catch (eL) {}
    }

    try {
      var selProps = comp.selectedProperties;
      if (selProps && typeof selProps.length === 'number') {
        var j;
        for (j = 0; j < selProps.length; j++) {
          try {
            var pr = selProps[j];
            if (!pr) continue;
            var entry = {
              name: String(pr.name || ''),
              matchName: pr.matchName ? String(pr.matchName) : '',
            };
            try {
              if (pr.canSetExpression !== undefined) {
                entry.canSetExpression = pr.canSetExpression === true;
              }
            } catch (eC) {}
            result.selectedProperties.push(entry);
          } catch (eP) {}
        }
      }
    } catch (eSel) {}

    return resultToJson(result);
  } catch (eOuter) {
    result.ok = false;
    result.message = 'motionPresets_getHostContext error: ' + eOuter.toString();
    return resultToJson(result);
  }
}
var _MOTION_PRESET_RECIPES = {
  fade: {
    defaults: { duration: 0.45, delay: 0, direction: 'in' },
    limits: { minDuration: 0.05, maxDuration: 5, minDelay: 0, maxDelay: 10 },
    easing: { startOutInfluence: 72, endInInfluence: 72 }
  },
  pop: {
    defaults: { duration: 0.42, delay: 0, direction: 'in', intensity: 1 },
    limits: { minDuration: 0.08, maxDuration: 5, minDelay: 0, maxDelay: 10, minIntensity: 0.2, maxIntensity: 1.5 },
    timing: { midRatio: 0.58 },
    factors: {
      inStartBase: 0.22,
      inOvershootBase: 0.16,
      outOvershootBase: 0.10,
      outEndShrinkBase: 0.20
    },
    easing: { firstOutInfluence: 70, midInInfluence: 72, midOutInfluence: 66, endInInfluence: 78 }
  },
  slide: {
    defaults: { duration: 0.50, delay: 0, direction: 'left', amplitude: 120 },
    limits: { minDuration: 0.08, maxDuration: 6, minDelay: 0, maxDelay: 10, minAmplitude: 8, maxAmplitude: 2000 },
    easing: { startOutInfluence: 74, endInInfluence: 74 }
  }
};

function _toFiniteNumber (raw) {
  if (typeof raw === 'number' && isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.length > 0) {
    var parsed = parseFloat(raw);
    if (isFinite(parsed)) return parsed;
  }
  return null;
}

function _readPresetNumber (opts, key, fallbackValue, minValue, maxValue, label) {
  var out = { ok: false, value: fallbackValue, message: '' };
  var raw = null;
  if (opts && typeof opts === 'object' && opts.hasOwnProperty(key)) raw = opts[key];
  if (raw === null || raw === undefined || raw === '') {
    out.ok = true;
    return out;
  }
  var n = _toFiniteNumber(raw);
  if (n === null) {
    out.message = label + ' must be a finite number.';
    return out;
  }
  if (n < minValue || n > maxValue) {
    out.message = label + ' must be in range [' + minValue + '..' + maxValue + '].';
    return out;
  }
  out.ok = true;
  out.value = n;
  return out;
}

function _readPresetEnum (opts, key, fallbackValue, allowedValues, label) {
  var out = { ok: false, value: fallbackValue, message: '' };
  var raw = null;
  if (opts && typeof opts === 'object' && opts.hasOwnProperty(key)) raw = opts[key];
  if (raw === null || raw === undefined || raw === '') {
    out.ok = true;
    return out;
  }
  var v = String(raw).toLowerCase();
  for (var i = 0; i < allowedValues.length; i++) {
    if (v === allowedValues[i]) {
      out.ok = true;
      out.value = v;
      return out;
    }
  }
  out.message = label + ' must be one of: ' + allowedValues.join(', ') + '.';
  return out;
}

function _setKeyAtTimeAndGetIndex (prop, time, value) {
  try { prop.setValueAtTime(time, value); } catch (e) { return -1; }
  try {
    var idx = prop.nearestKeyIndex(time);
    if (idx > 0 && Math.abs(prop.keyTime(idx) - time) < 0.0005) return idx;
  } catch (e2) {}
  return -1;
}

/**
 * Determine the number of temporal ease dimensions for a property.
 * Reads existing ease from a key if available; falls back to value inspection.
 * This avoids the broken `prop.value instanceof Array` pattern that returns
 * wrong counts for spatial properties (Position needs dims matching its
 * actual temporal ease structure, not its value array length).
 */
function _getTemporalEaseDims (prop, keyIndex) {
  // Best source: read existing temporal ease from the key itself
  if (typeof keyIndex === 'number' && keyIndex >= 1 && keyIndex <= prop.numKeys) {
    try {
      var existing = prop.keyTemporalEase(keyIndex, false);
      if (existing instanceof Array && existing.length > 0) return existing.length;
    } catch (e1) {}
    // Some AE versions: keyTemporalEase(idx) without second arg
    try {
      var ex2 = prop.keyTemporalEase(keyIndex);
      if (ex2 instanceof Array && ex2.length > 0) return ex2.length;
    } catch (e2) {}
  }
  // Fallback: try reading from any existing key
  if (prop.numKeys >= 1) {
    var probe = (typeof keyIndex === 'number' && keyIndex >= 1) ? keyIndex : 1;
    try {
      var ex3 = prop.keyTemporalEase(probe);
      if (ex3 instanceof Array && ex3.length > 0) return ex3.length;
    } catch (e3) {}
  }
  // Last resort: value inspection
  try {
    var v = prop.value;
    if (v instanceof Array) return v.length;
  } catch (e4) {}
  return 1;
}

function _setKeyEaseBezier (prop, keyIndex, inInfluence, outInfluence) {
  if (!(keyIndex >= 1)) return;
  try {
    prop.setInterpolationTypeAtKey(keyIndex, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
  } catch (eInterp) {}
  var inInf = (typeof inInfluence === 'number') ? inInfluence : 33.33;
  var outInf = (typeof outInfluence === 'number') ? outInfluence : 33.33;
  var dims = _getTemporalEaseDims(prop, keyIndex);
  var easeIn = [];
  var easeOut = [];
  for (var d = 0; d < dims; d++) {
    easeIn.push(new KeyframeEase(0, inInf));
    easeOut.push(new KeyframeEase(0, outInf));
  }
  try {
    prop.setTemporalEaseAtKey(keyIndex, easeIn, easeOut);
  } catch (eEase) {
    // Retry with 1 dimension (spatial properties like Position)
    if (dims > 1) {
      try {
        prop.setTemporalEaseAtKey(keyIndex, [easeIn[0]], [easeOut[0]]);
      } catch (eRetry) {}
    }
  }
}

function _copyArrayValue (val) {
  if (!(val instanceof Array)) return val;
  var out = [];
  for (var i = 0; i < val.length; i++) out.push(val[i]);
  return out;
}

function _scaleValueByFactor (baseValue, factor) {
  if (baseValue instanceof Array) {
    var arr = [];
    for (var i = 0; i < baseValue.length; i++) arr.push(baseValue[i] * factor);
    return arr;
  }
  return baseValue * factor;
}

function _offsetPositionByDirection (basePosition, direction, amplitude) {
  var p = _copyArrayValue(basePosition);
  if (!(p instanceof Array) || p.length < 2) return null;
  if (direction === 'left') p[0] = p[0] - amplitude;
  else if (direction === 'right') p[0] = p[0] + amplitude;
  else if (direction === 'up') p[1] = p[1] - amplitude;
  else if (direction === 'down') p[1] = p[1] + amplitude;
  return p;
}

function motionPresets_applyFadePreset (layerIndex, layerId, options) {
  var result = {
    ok: false,
    message: '',
    preset: 'fade',
    layerName: '',
    startTime: null,
    endTime: null
  };
  try {
    var ctx = motionPresets_resolveActiveComp();
    if (!ctx.ok || !ctx.comp) { result.message = ctx.message || 'No active composition.'; return resultToJson(result); }
    var comp = ctx.comp;
    var layer = _resolveLayer(comp, layerIndex, layerId);
    if (!layer) { result.message = 'Layer not found by layer_id/layer_index.'; return resultToJson(result); }

    var recipe = _MOTION_PRESET_RECIPES.fade;
    var durationRes = _readPresetNumber(options, 'duration', recipe.defaults.duration, recipe.limits.minDuration, recipe.limits.maxDuration, 'duration');
    if (!durationRes.ok) { result.message = durationRes.message; return resultToJson(result); }
    var delayRes = _readPresetNumber(options, 'delay', recipe.defaults.delay, recipe.limits.minDelay, recipe.limits.maxDelay, 'delay');
    if (!delayRes.ok) { result.message = delayRes.message; return resultToJson(result); }
    var directionRes = _readPresetEnum(options, 'direction', recipe.defaults.direction, ['in', 'out'], 'direction');
    if (!directionRes.ok) { result.message = directionRes.message; return resultToJson(result); }

    var opacityProp = _resolveProperty(layer, 'Transform>Opacity');
    if (!(opacityProp instanceof Property)) {
      result.message = 'Layer does not expose Transform>Opacity.';
      return resultToJson(result);
    }

    var t0 = comp.time + delayRes.value;
    var t1 = t0 + durationRes.value;
    var startOpacity = (directionRes.value === 'in') ? 0 : 100;
    var endOpacity = (directionRes.value === 'in') ? 100 : 0;

    _beginToolUndo('Agent: Apply Fade Preset');
    var k0 = _setKeyAtTimeAndGetIndex(opacityProp, t0, startOpacity);
    var k1 = _setKeyAtTimeAndGetIndex(opacityProp, t1, endOpacity);
    _setKeyEaseBezier(opacityProp, k0, 33.33, recipe.easing.startOutInfluence);
    _setKeyEaseBezier(opacityProp, k1, recipe.easing.endInInfluence, 33.33);
    _endToolUndo();

    result.ok = true;
    result.layerName = layer.name;
    result.startTime = t0;
    result.endTime = t1;
    result.message =
      'Applied fade ' + directionRes.value + ' preset to "' + layer.name + '" (duration=' + durationRes.value + 's, delay=' + delayRes.value + 's).';
    return resultToJson(result);
  } catch (e) {
    try { _endToolUndo(); } catch (x) {}
    result.message = 'applyFadePreset error: ' + e.toString();
    return resultToJson(result);
  }
}

function motionPresets_applyPopPreset (layerIndex, layerId, options) {
  var result = {
    ok: false,
    message: '',
    preset: 'pop',
    layerName: '',
    startTime: null,
    midTime: null,
    endTime: null
  };
  try {
    var ctx = motionPresets_resolveActiveComp();
    if (!ctx.ok || !ctx.comp) { result.message = ctx.message || 'No active composition.'; return resultToJson(result); }
    var comp = ctx.comp;
    var layer = _resolveLayer(comp, layerIndex, layerId);
    if (!layer) { result.message = 'Layer not found by layer_id/layer_index.'; return resultToJson(result); }

    var recipe = _MOTION_PRESET_RECIPES.pop;
    var durationRes = _readPresetNumber(options, 'duration', recipe.defaults.duration, recipe.limits.minDuration, recipe.limits.maxDuration, 'duration');
    if (!durationRes.ok) { result.message = durationRes.message; return resultToJson(result); }
    var delayRes = _readPresetNumber(options, 'delay', recipe.defaults.delay, recipe.limits.minDelay, recipe.limits.maxDelay, 'delay');
    if (!delayRes.ok) { result.message = delayRes.message; return resultToJson(result); }
    var directionRes = _readPresetEnum(options, 'direction', recipe.defaults.direction, ['in', 'out'], 'direction');
    if (!directionRes.ok) { result.message = directionRes.message; return resultToJson(result); }
    var intensityRes = _readPresetNumber(options, 'intensity', recipe.defaults.intensity, recipe.limits.minIntensity, recipe.limits.maxIntensity, 'intensity');
    if (!intensityRes.ok) { result.message = intensityRes.message; return resultToJson(result); }

    var scaleProp = _resolveProperty(layer, 'Transform>Scale');
    var opacityProp = _resolveProperty(layer, 'Transform>Opacity');
    if (!(scaleProp instanceof Property)) { result.message = 'Layer does not expose Transform>Scale.'; return resultToJson(result); }
    if (!(opacityProp instanceof Property)) { result.message = 'Layer does not expose Transform>Opacity.'; return resultToJson(result); }

    var baseScale = _copyArrayValue(scaleProp.value);
    var t0 = comp.time + delayRes.value;
    var tMid = t0 + (durationRes.value * recipe.timing.midRatio);
    var t1 = t0 + durationRes.value;
    var intensity = intensityRes.value;
    var startScale = null;
    var midScale = null;
    var endScale = null;
    var o0 = 100;
    var oMid = 100;
    var o1 = 100;

    if (directionRes.value === 'in') {
      startScale = _scaleValueByFactor(baseScale, 1 - (recipe.factors.inStartBase * intensity));
      midScale = _scaleValueByFactor(baseScale, 1 + (recipe.factors.inOvershootBase * intensity));
      endScale = _copyArrayValue(baseScale);
      o0 = 0;
      oMid = 100;
      o1 = 100;
    } else {
      startScale = _copyArrayValue(baseScale);
      midScale = _scaleValueByFactor(baseScale, 1 + (recipe.factors.outOvershootBase * intensity));
      endScale = _scaleValueByFactor(baseScale, 1 - (recipe.factors.outEndShrinkBase * intensity));
      o0 = 100;
      oMid = 100;
      o1 = 0;
    }

    _beginToolUndo('Agent: Apply Pop Preset');
    var s0 = _setKeyAtTimeAndGetIndex(scaleProp, t0, startScale);
    var sMid = _setKeyAtTimeAndGetIndex(scaleProp, tMid, midScale);
    var s1 = _setKeyAtTimeAndGetIndex(scaleProp, t1, endScale);
    _setKeyEaseBezier(scaleProp, s0, 33.33, recipe.easing.firstOutInfluence);
    _setKeyEaseBezier(scaleProp, sMid, recipe.easing.midInInfluence, recipe.easing.midOutInfluence);
    _setKeyEaseBezier(scaleProp, s1, recipe.easing.endInInfluence, 33.33);

    var oKey0 = _setKeyAtTimeAndGetIndex(opacityProp, t0, o0);
    var oKeyMid = _setKeyAtTimeAndGetIndex(opacityProp, tMid, oMid);
    var oKey1 = _setKeyAtTimeAndGetIndex(opacityProp, t1, o1);
    _setKeyEaseBezier(opacityProp, oKey0, 33.33, recipe.easing.firstOutInfluence);
    _setKeyEaseBezier(opacityProp, oKeyMid, recipe.easing.midInInfluence, recipe.easing.midOutInfluence);
    _setKeyEaseBezier(opacityProp, oKey1, recipe.easing.endInInfluence, 33.33);
    _endToolUndo();

    result.ok = true;
    result.layerName = layer.name;
    result.startTime = t0;
    result.midTime = tMid;
    result.endTime = t1;
    result.message =
      'Applied pop ' + directionRes.value + ' preset to "' + layer.name + '" (duration=' + durationRes.value + 's, delay=' + delayRes.value + 's, intensity=' + intensity + ').';
    return resultToJson(result);
  } catch (e) {
    try { _endToolUndo(); } catch (x) {}
    result.message = 'applyPopPreset error: ' + e.toString();
    return resultToJson(result);
  }
}

function motionPresets_applySlidePreset (layerIndex, layerId, options) {
  var result = {
    ok: false,
    message: '',
    preset: 'slide',
    layerName: '',
    startTime: null,
    endTime: null
  };
  try {
    var ctx = motionPresets_resolveActiveComp();
    if (!ctx.ok || !ctx.comp) { result.message = ctx.message || 'No active composition.'; return resultToJson(result); }
    var comp = ctx.comp;
    var layer = _resolveLayer(comp, layerIndex, layerId);
    if (!layer) { result.message = 'Layer not found by layer_id/layer_index.'; return resultToJson(result); }

    var recipe = _MOTION_PRESET_RECIPES.slide;
    var durationRes = _readPresetNumber(options, 'duration', recipe.defaults.duration, recipe.limits.minDuration, recipe.limits.maxDuration, 'duration');
    if (!durationRes.ok) { result.message = durationRes.message; return resultToJson(result); }
    var delayRes = _readPresetNumber(options, 'delay', recipe.defaults.delay, recipe.limits.minDelay, recipe.limits.maxDelay, 'delay');
    if (!delayRes.ok) { result.message = delayRes.message; return resultToJson(result); }
    var directionRes = _readPresetEnum(options, 'direction', recipe.defaults.direction, ['left', 'right', 'up', 'down'], 'direction');
    if (!directionRes.ok) { result.message = directionRes.message; return resultToJson(result); }
    var ampRes = _readPresetNumber(options, 'amplitude', recipe.defaults.amplitude, recipe.limits.minAmplitude, recipe.limits.maxAmplitude, 'amplitude');
    if (!ampRes.ok) { result.message = ampRes.message; return resultToJson(result); }

    var positionProp = _resolveProperty(layer, 'Transform>Position');
    var opacityProp = _resolveProperty(layer, 'Transform>Opacity');
    if (!(positionProp instanceof Property)) { result.message = 'Layer does not expose Transform>Position.'; return resultToJson(result); }
    if (!(opacityProp instanceof Property)) { result.message = 'Layer does not expose Transform>Opacity.'; return resultToJson(result); }

    var endPos = _copyArrayValue(positionProp.value);
    var startPos = _offsetPositionByDirection(endPos, directionRes.value, ampRes.value);
    if (!startPos) {
      result.message = 'Transform>Position must be at least 2D for slide preset.';
      return resultToJson(result);
    }

    var t0 = comp.time + delayRes.value;
    var t1 = t0 + durationRes.value;

    _beginToolUndo('Agent: Apply Slide Preset');
    var p0 = _setKeyAtTimeAndGetIndex(positionProp, t0, startPos);
    var p1 = _setKeyAtTimeAndGetIndex(positionProp, t1, endPos);
    _setKeyEaseBezier(positionProp, p0, 33.33, recipe.easing.startOutInfluence);
    _setKeyEaseBezier(positionProp, p1, recipe.easing.endInInfluence, 33.33);

    var o0 = _setKeyAtTimeAndGetIndex(opacityProp, t0, 0);
    var o1 = _setKeyAtTimeAndGetIndex(opacityProp, t1, 100);
    _setKeyEaseBezier(opacityProp, o0, 33.33, recipe.easing.startOutInfluence);
    _setKeyEaseBezier(opacityProp, o1, recipe.easing.endInInfluence, 33.33);
    _endToolUndo();

    result.ok = true;
    result.layerName = layer.name;
    result.startTime = t0;
    result.endTime = t1;
    result.message =
      'Applied slide preset to "' + layer.name + '" from ' + directionRes.value + ' (duration=' + durationRes.value + 's, delay=' + delayRes.value + 's, amplitude=' + ampRes.value + ').';
    return resultToJson(result);
  } catch (e) {
    try { _endToolUndo(); } catch (x) {}
    result.message = 'applySlidePreset error: ' + e.toString();
    return resultToJson(result);
  }
}

// ============================================================================
// Brand preset tools (Cloud.ru)
// ============================================================================

var _BRAND_COLORS = {
  green: [0.149, 0.816, 0.486],
  dark: [0.133, 0.133, 0.133],
  lightGreen: [0.812, 0.961, 0],
  nearWhite: [0.969, 0.969, 0.969],
  white: [1, 1, 1],
  black: [0, 0, 0]
};

// Logo icon cube — 3 faces, SVG vertices scaled 5x (~189×198 px base)
var _BRAND_LOGO_PATHS = [
  { // right-bottom face
    v: [[101.47,105.66],[189.09,105.66],[189.09,161.48],[101.46,198.39]],
    c: true
  },
  { // right-top face
    v: [[189.09,92.74],[189.09,36.92],[101.47,0],[101.47,92.69]],
    c: true
  },
  { // left face
    v: [[0,36.92],[0,161.50],[87.63,198.40],[87.63,0]],
    c: true
  }
];
var _BRAND_LOGO_W = 189.09;
var _BRAND_LOGO_H = 198.40;

/**
 * Add a closed straight-line path to a shape group's Contents.
 */
function _addBrandPath (groupContents, vertices, closed) {
  var pathGrp = groupContents.addProperty('ADBE Vector Shape - Group');
  var shapeProp = pathGrp.property('ADBE Vector Shape');
  var s = new Shape();
  s.closed = closed !== false;
  s.vertices = vertices;
  var t = [];
  for (var i = 0; i < vertices.length; i++) t.push([0, 0]);
  s.inTangents = t;
  s.outTangents = t;
  shapeProp.setValue(s);
  return pathGrp;
}

function _addBrandFill (groupContents, color) {
  var fill = groupContents.addProperty('ADBE Vector Graphic - Fill');
  fill.property('ADBE Vector Fill Color').setValue(color);
  return fill;
}

function _addBrandRect (groupContents, w, h, fillColor, pos) {
  var rect = groupContents.addProperty('ADBE Vector Shape - Rect');
  rect.property('ADBE Vector Rect Size').setValue([w, h]);
  if (pos) rect.property('ADBE Vector Rect Position').setValue(pos);
  if (fillColor) _addBrandFill(groupContents, fillColor);
  return rect;
}

/**
 * Create a shape bar layer anchored at left edge for horizontal wipe animation.
 * Rect is offset so left edge sits at layer origin → scaleX grows rightward.
 */
function _createBrandWipeBar (comp, name, w, h, fillColor, parentLayer, posY) {
  var layer = comp.layers.addShape();
  layer.name = name;
  var root = layer.property('ADBE Root Vectors Group');
  var grp = root.addProperty('ADBE Vector Group');
  grp.name = 'Bar';
  _addBrandRect(grp.property('ADBE Vectors Group'), w, h, fillColor, [w / 2, 0]);
  if (parentLayer) layer.parent = parentLayer;
  layer.property('Transform').property('Position').setValue([0, posY]);
  return layer;
}

function _setTextDoc (textLayer, text, fontSize, fillColor, fontName, justify) {
  var prop = textLayer.property('Source Text');
  var doc = prop.value;
  doc.resetCharStyle();
  // doc.text requires AE 2019+; text is already set via addText(), so only
  // assign when the caller needs to change it from the initial addText value.
  try { doc.text = text; } catch (eText) {}
  doc.fontSize = fontSize;
  doc.fillColor = fillColor;
  try { doc.font = fontName; } catch (ef) {}
  if (typeof justify !== 'undefined') doc.justification = justify;
  prop.setValue(doc);
}

/**
 * Add character-by-character reveal animator to a text layer.
 * Range Selector Start 0→100 sweeps left-to-right; characters slide from
 * posOffset to normal position and fade from 0 to full opacity.
 */
function _addTextRevealAnimator (textLayer, startTime, revealDur, posOffset) {
  var textProp = textLayer.property('ADBE Text Properties');
  var animators = textProp.property('ADBE Text Animators');
  var animator = animators.addProperty('ADBE Text Animator');
  animator.name = 'Char Reveal';
  var animProps = animator.property('ADBE Text Animator Properties');
  var pos3d = animProps.addProperty('ADBE Text Position 3D');
  pos3d.setValue(posOffset);
  var opProp = animProps.addProperty('ADBE Text Opacity');
  opProp.setValue(0);
  var selector = animator.property('ADBE Text Selectors').property(1);
  var startProp = selector.property('ADBE Text Percent Start');
  var sk0 = _setKeyAtTimeAndGetIndex(startProp, startTime, 0);
  var sk1 = _setKeyAtTimeAndGetIndex(startProp, startTime + revealDur, 100);
  _setKeyEaseBezier(startProp, sk0, 33.3, 33.3);
  _setKeyEaseBezier(startProp, sk1, 100, 33.3);
  return animator;
}

// ── brand_logo_reveal ──────────────────────────────────────────────────

function motionPresets_applyBrandLogoReveal (options) {
  var result = { ok: false, message: '', preset: 'brand_logo_reveal', layers: [] };
  try {
    var ctx = motionPresets_resolveActiveComp();
    if (!ctx.ok || !ctx.comp) { result.message = ctx.message || 'No active composition.'; return resultToJson(result); }
    var comp = ctx.comp;
    var opts = options || {};

    var duration = 2.2;
    if (opts.duration != null && isFinite(Number(opts.duration))) duration = Math.max(0.5, Math.min(Number(opts.duration), 10));
    var withSubline = !!opts.with_subline;
    var sublineText = String(opts.subline_text || '\u0423\u043C\u043D\u043E\u0435 \u043E\u0431\u043B\u0430\u043A\u043E \u0441 \u0418\u0418-\u043F\u043E\u043C\u043E\u0449\u043D\u0438\u043A\u043E\u043C');
    var withBg = !!opts.with_background;

    var cx = comp.width / 2;
    var cy = comp.height / 2;
    var t0 = comp.time;
    var tP1 = t0 + duration * 0.45;
    var tP2 = t0 + duration * 0.80;
    var tEnd = t0 + duration;

    _beginToolUndo('Agent: Brand Logo Reveal');

    // ── Parent null — controls scale/position of the whole logo group ──
    var ctrlNull = comp.layers.addNull();
    ctrlNull.name = 'Logo Reveal Ctrl';
    ctrlNull.property('Transform').property('Position').setValue([cx, cy]);
    ctrlNull.property('Transform').property('Opacity').setValue(0);

    // ── Logo Icon shape layer ──
    var iconLayer = comp.layers.addShape();
    iconLayer.name = 'Logo Icon';
    iconLayer.parent = ctrlNull;

    var rootContents = iconLayer.property('ADBE Root Vectors Group');
    var iconGrp = rootContents.addProperty('ADBE Vector Group');
    iconGrp.name = 'Icon';
    var iconContents = iconGrp.property('ADBE Vectors Group');

    for (var pi = 0; pi < _BRAND_LOGO_PATHS.length; pi++) {
      _addBrandPath(iconContents, _BRAND_LOGO_PATHS[pi].v, _BRAND_LOGO_PATHS[pi].c);
    }
    _addBrandFill(iconContents, _BRAND_COLORS.green);

    // Center icon: anchor at shape center
    iconLayer.property('Transform').property('Anchor Point').setValue([_BRAND_LOGO_W / 2, _BRAND_LOGO_H / 2]);

    // Position: elastic overshoot (spec: slide right → overshoot → bounce → settle at center)
    // Ref values for 1920px: [1161,540]→[1241,540]→[1019,540]→[964,540] i.e. +10.5%W → +14.6%W → +3.1%W → ~0
    var iconFinalX = withSubline ? -comp.width * 0.05 : 0;
    var posProp = iconLayer.property('Transform').property('Position');
    var kp0 = _setKeyAtTimeAndGetIndex(posProp, t0, [iconFinalX + comp.width * 0.105, 0]);
    var kp1 = _setKeyAtTimeAndGetIndex(posProp, tP1, [iconFinalX + comp.width * 0.146, 0]);
    var kp2 = _setKeyAtTimeAndGetIndex(posProp, tP2, [iconFinalX + comp.width * 0.031, 0]);
    var kp3 = _setKeyAtTimeAndGetIndex(posProp, tEnd, [iconFinalX, 0]);
    _setKeyEaseBezier(posProp, kp0, 16.7, 16.7);
    _setKeyEaseBezier(posProp, kp1, 16.7, 16.7);
    _setKeyEaseBezier(posProp, kp2, 16.7, 16.7);
    _setKeyEaseBezier(posProp, kp3, 16.7, 16.7);

    // Scale: zoom overshoot (spec ratios: 250→350→221→189, normalized to final=100%)
    // Icon fades in during first phase so starts visible-but-growing, not popping from zero
    var scaleProp = iconLayer.property('Transform').property('Scale');
    var ks0 = _setKeyAtTimeAndGetIndex(scaleProp, t0, [132, 132]);
    var ks1 = _setKeyAtTimeAndGetIndex(scaleProp, tP1, [185, 185]);
    var ks2 = _setKeyAtTimeAndGetIndex(scaleProp, tP2, [117, 117]);
    var ks3 = _setKeyAtTimeAndGetIndex(scaleProp, tEnd, [100, 100]);
    _setKeyEaseBezier(scaleProp, ks0, 33.3, 33.3);
    _setKeyEaseBezier(scaleProp, ks1, 68, 51);
    _setKeyEaseBezier(scaleProp, ks2, 26, 31);
    _setKeyEaseBezier(scaleProp, ks3, 38, 33.3);

    // Opacity 0→100
    var opProp = iconLayer.property('Transform').property('Opacity');
    var ko0 = _setKeyAtTimeAndGetIndex(opProp, t0, 0);
    var ko1 = _setKeyAtTimeAndGetIndex(opProp, tP1, 100);
    _setKeyEaseBezier(opProp, ko0, 33.3, 33.3);
    _setKeyEaseBezier(opProp, ko1, 68, 33.3);

    result.layers.push({ name: 'Logo Reveal Ctrl', index: ctrlNull.index });
    result.layers.push({ name: 'Logo Icon', index: iconLayer.index });

    // ── "Cloud.ru" text layer — Linear Wipe reveal (horizontal, left to right) ──
    var textLayer = comp.layers.addText('Cloud.ru');
    textLayer.name = 'Cloud.ru Text';
    textLayer.parent = ctrlNull;
    _setTextDoc(textLayer, 'Cloud.ru', 72, _BRAND_COLORS.nearWhite, 'SBSansDisplay-Semibold', ParagraphJustification.LEFT_JUSTIFY);

    var textFinalX = iconFinalX + 130;
    textLayer.property('Transform').property('Position').setValue([textFinalX, 10]);

    // Linear Wipe effect: angle 90° (left-to-right), Transition Completion 100→0
    var wipeEffect = textLayer.property('ADBE Effect Parade').addProperty('ADBE Linear Wipe');
    wipeEffect.property('ADBE Linear Wipe-0002').setValue(90);   // Wipe Angle
    wipeEffect.property('ADBE Linear Wipe-0003').setValue(15);   // Feather
    var tcProp = wipeEffect.property('ADBE Linear Wipe-0001');   // Transition Completion
    var wk0 = _setKeyAtTimeAndGetIndex(tcProp, tP1, 100);
    var wk1 = _setKeyAtTimeAndGetIndex(tcProp, tP1 + (tP2 - tP1) * 0.5, 15);
    var wk2 = _setKeyAtTimeAndGetIndex(tcProp, tP2, 0);
    _setKeyEaseBezier(tcProp, wk0, 33.3, 33.3);
    _setKeyEaseBezier(tcProp, wk1, 50, 50);
    _setKeyEaseBezier(tcProp, wk2, 100, 33.3);

    result.layers.push({ name: 'Cloud.ru Text', index: textLayer.index });

    // ── Optional subline ──
    if (withSubline) {
      var subLayer = comp.layers.addText(sublineText);
      subLayer.name = 'Subline';
      subLayer.parent = ctrlNull;
      _setTextDoc(subLayer, sublineText, 28, _BRAND_COLORS.dark, 'SBSansDisplay-Semibold', ParagraphJustification.LEFT_JUSTIFY);
      var subPosX = textFinalX;
      var subPosY = 55;

      // Fade + slide in starting from tP1 (overlaps with icon settle)
      var sOp = subLayer.property('Transform').property('Opacity');
      var soK0 = _setKeyAtTimeAndGetIndex(sOp, tP1, 0);
      var soK1 = _setKeyAtTimeAndGetIndex(sOp, tP2, 100);
      _setKeyEaseBezier(sOp, soK0, 33.3, 100);
      _setKeyEaseBezier(sOp, soK1, 100, 33.3);

      var sPos = subLayer.property('Transform').property('Position');
      var subSlideOff = comp.width * 0.18;
      var spK0 = _setKeyAtTimeAndGetIndex(sPos, tP1, [subPosX + subSlideOff, subPosY]);
      var spK1 = _setKeyAtTimeAndGetIndex(sPos, tP2, [subPosX, subPosY]);
      _setKeyEaseBezier(sPos, spK0, 16.7, 16.7);
      _setKeyEaseBezier(sPos, spK1, 16.7, 16.7);

      result.layers.push({ name: 'Subline', index: subLayer.index });

      // Optional dark bar behind subline (left-edge anchor for horizontal grow)
      if (withBg) {
        var bgLayer = _createBrandWipeBar(comp, 'Subline BG', 470, 50, _BRAND_COLORS.dark, ctrlNull, subPosY - 5);
        bgLayer.property('Transform').property('Position').setValue([subPosX, subPosY - 5]);
        var bgScale = bgLayer.property('Transform').property('Scale');
        var bgK0 = _setKeyAtTimeAndGetIndex(bgScale, tP1, [0, 100]);
        var bgK1 = _setKeyAtTimeAndGetIndex(bgScale, tP1 + (tP2 - tP1) * 0.5, [55, 100]);
        var bgK2 = _setKeyAtTimeAndGetIndex(bgScale, tP2, [100, 100]);
        _setKeyEaseBezier(bgScale, bgK0, 33.3, 63.2);
        _setKeyEaseBezier(bgScale, bgK1, 17.1, 55.2);
        _setKeyEaseBezier(bgScale, bgK2, 100, 33.3);
        bgLayer.moveAfter(subLayer);
        result.layers.push({ name: 'Subline BG', index: bgLayer.index });
      }
    }

    // ── Backing plate for no-subline variant ("с плашкой") ──
    if (!withSubline && withBg) {
      var plateW = comp.width * 0.42;
      var plateH = 100;
      var plateLayer = comp.layers.addShape();
      plateLayer.name = 'Logo Plate';
      var plRoot = plateLayer.property('ADBE Root Vectors Group');
      var plGrp = plRoot.addProperty('ADBE Vector Group');
      plGrp.name = 'Plate';
      _addBrandRect(plGrp.property('ADBE Vectors Group'), plateW, plateH, _BRAND_COLORS.dark);
      plateLayer.parent = ctrlNull;
      plateLayer.property('Transform').property('Position').setValue([30, 0]);
      // ScaleX wipe: 0→100 (ref: Подложка 0→49% of full-width plate)
      var plScale = plateLayer.property('Transform').property('Scale');
      var plK0 = _setKeyAtTimeAndGetIndex(plScale, tP1, [0, 100]);
      var plK1 = _setKeyAtTimeAndGetIndex(plScale, tP2, [100, 100]);
      _setKeyEaseBezier(plScale, plK0, 33.3, 33.3);
      _setKeyEaseBezier(plScale, plK1, 100, 33.3);
      try { plateLayer.moveToEnd(); } catch (eMove) {}
      result.layers.push({ name: 'Logo Plate', index: plateLayer.index });
    }

    _endToolUndo();
    result.ok = true;
    result.message = 'Brand logo reveal created (' + result.layers.length + ' layers, duration=' + duration + 's).';
    return resultToJson(result);
  } catch (e) {
    try { _endToolUndo(); } catch (x) {}
    result.message = 'brandLogoReveal error: ' + e.toString();
    return resultToJson(result);
  }
}

// ── brand_lower_third ──────────────────────────────────────────────────

function motionPresets_applyBrandLowerThird (options) {
  var result = { ok: false, message: '', preset: 'brand_lower_third', layers: [] };
  try {
    var ctx = motionPresets_resolveActiveComp();
    if (!ctx.ok || !ctx.comp) { result.message = ctx.message || 'No active composition.'; return resultToJson(result); }
    var comp = ctx.comp;
    var opts = options || {};

    var nameText = String(opts.name_text || 'Speaker Name');
    var titleText = String(opts.title_text || 'Job Title');
    var displayDur = 5;
    if (opts.display_duration != null && isFinite(Number(opts.display_duration))) displayDur = Math.max(3, Math.min(Number(opts.display_duration), 30));

    // Timing (based on spec). Min 3s ensures bar2 stagger doesn't overlap hold phase.
    var t0 = comp.time;
    var tBarOpen = t0 + 0.8;
    var tBarClose = t0 + displayDur - 0.8;
    var tClose = t0 + displayDur;
    var stagger = 0.24;

    // Position: lower-left area
    var baseX = comp.width * 0.08;
    var baseY = comp.height * 0.78;

    _beginToolUndo('Agent: Brand Lower Third');

    // ── Null controller (invisible, controls position/scale of all children) ──
    var nullLayer = comp.layers.addNull();
    nullLayer.name = 'LT Controller';
    nullLayer.property('Transform').property('Position').setValue([baseX, baseY]);
    nullLayer.property('Transform').property('Opacity').setValue(0);

    // ── Bar 1 (main dark bar, left-edge anchored) ──
    var bar1 = _createBrandWipeBar(comp, 'LT Bar 1', 500, 52, _BRAND_COLORS.dark, nullLayer, 0);
    var b1Scale = bar1.property('Transform').property('Scale');
    var b1k0 = _setKeyAtTimeAndGetIndex(b1Scale, t0, [0, 100]);
    var b1k1 = _setKeyAtTimeAndGetIndex(b1Scale, tBarOpen, [122.8, 100]);
    var b1k2 = _setKeyAtTimeAndGetIndex(b1Scale, tBarClose, [122.8, 100]);
    var b1k3 = _setKeyAtTimeAndGetIndex(b1Scale, tClose, [0, 100]);
    _setKeyEaseBezier(b1Scale, b1k0, 33, 33);
    _setKeyEaseBezier(b1Scale, b1k1, 100, 33);
    _setKeyEaseBezier(b1Scale, b1k2, 100, 100);
    _setKeyEaseBezier(b1Scale, b1k3, 33, 33);
    result.layers.push({ name: 'LT Bar 1', index: bar1.index });

    // ── Bar 2 (secondary dark bar, staggered 240ms, left-edge anchored) ──
    var bar2 = _createBrandWipeBar(comp, 'LT Bar 2', 500, 52, _BRAND_COLORS.dark, nullLayer, 55);
    var b2Scale = bar2.property('Transform').property('Scale');
    var b2k0 = _setKeyAtTimeAndGetIndex(b2Scale, t0 + stagger, [0, 100]);
    var b2k1 = _setKeyAtTimeAndGetIndex(b2Scale, tBarOpen + stagger, [91.5, 100]);
    var b2k2 = _setKeyAtTimeAndGetIndex(b2Scale, tBarClose - stagger, [91.5, 100]);
    var b2k3 = _setKeyAtTimeAndGetIndex(b2Scale, tClose - stagger, [0, 100]);
    _setKeyEaseBezier(b2Scale, b2k0, 33, 33);
    _setKeyEaseBezier(b2Scale, b2k1, 100, 33);
    _setKeyEaseBezier(b2Scale, b2k2, 100, 100);
    _setKeyEaseBezier(b2Scale, b2k3, 33, 33);
    result.layers.push({ name: 'LT Bar 2', index: bar2.index });

    // ── White flash bar 1 (bar 1 enter/exit flash, left-edge anchored) ──
    var flash1 = _createBrandWipeBar(comp, 'LT Flash 1', 500, 52, _BRAND_COLORS.white, nullLayer, 0);
    var f1Op = flash1.property('Transform').property('Opacity');
    _setKeyAtTimeAndGetIndex(f1Op, t0, 80);
    _setKeyAtTimeAndGetIndex(f1Op, tBarOpen, 0);
    _setKeyAtTimeAndGetIndex(f1Op, tBarClose, 0);
    _setKeyAtTimeAndGetIndex(f1Op, tClose, 80);
    for (var fi = 1; fi <= f1Op.numKeys; fi++) _setKeyEaseBezier(f1Op, fi, 50, 50);
    var f1Scale = flash1.property('Transform').property('Scale');
    _setKeyAtTimeAndGetIndex(f1Scale, t0, [0, 100]);
    _setKeyAtTimeAndGetIndex(f1Scale, tBarOpen, [122.8, 100]);
    _setKeyAtTimeAndGetIndex(f1Scale, tBarClose, [122.8, 100]);
    _setKeyAtTimeAndGetIndex(f1Scale, tClose, [0, 100]);
    for (var fsi = 1; fsi <= f1Scale.numKeys; fsi++) _setKeyEaseBezier(f1Scale, fsi, 50, 50);
    result.layers.push({ name: 'LT Flash 1', index: flash1.index });

    // ── White flash bar 2 (bar 2 enter/exit flash, left-edge anchored) ──
    var flash2 = _createBrandWipeBar(comp, 'LT Flash 2', 500, 52, _BRAND_COLORS.white, nullLayer, 55);
    var f2Op = flash2.property('Transform').property('Opacity');
    _setKeyAtTimeAndGetIndex(f2Op, t0 + stagger, 80);
    _setKeyAtTimeAndGetIndex(f2Op, tBarOpen + stagger, 0);
    _setKeyAtTimeAndGetIndex(f2Op, tBarClose - stagger, 0);
    _setKeyAtTimeAndGetIndex(f2Op, tClose - stagger, 80);
    for (var f2i = 1; f2i <= f2Op.numKeys; f2i++) _setKeyEaseBezier(f2Op, f2i, 50, 50);
    var f2Scale = flash2.property('Transform').property('Scale');
    _setKeyAtTimeAndGetIndex(f2Scale, t0 + stagger, [0, 100]);
    _setKeyAtTimeAndGetIndex(f2Scale, tBarOpen + stagger, [91.5, 100]);
    _setKeyAtTimeAndGetIndex(f2Scale, tBarClose - stagger, [91.5, 100]);
    _setKeyAtTimeAndGetIndex(f2Scale, tClose - stagger, [0, 100]);
    for (var f2si = 1; f2si <= f2Scale.numKeys; f2si++) _setKeyEaseBezier(f2Scale, f2si, 50, 50);
    result.layers.push({ name: 'LT Flash 2', index: flash2.index });

    // ── Name text ──
    var nameLayer = comp.layers.addText(nameText);
    nameLayer.name = 'LT Name';
    _setTextDoc(nameLayer, nameText, 40, _BRAND_COLORS.white, 'SBSansText-Regular', ParagraphJustification.LEFT_JUSTIFY);
    nameLayer.parent = nullLayer;
    nameLayer.property('Transform').property('Position').setValue([20, -8]);
    nameLayer.inPoint = t0 + stagger;
    nameLayer.outPoint = tClose - stagger;
    _addTextRevealAnimator(nameLayer, t0 + stagger, 0.52, [0, 45, 0]);
    result.layers.push({ name: 'LT Name', index: nameLayer.index });

    // ── Title text ──
    var titleLayer = comp.layers.addText(titleText);
    titleLayer.name = 'LT Title';
    _setTextDoc(titleLayer, titleText, 22, _BRAND_COLORS.white, 'SBSansText-Regular', ParagraphJustification.LEFT_JUSTIFY);
    titleLayer.parent = nullLayer;
    titleLayer.property('Transform').property('Position').setValue([20, 46]);
    titleLayer.inPoint = t0 + stagger * 2.33;
    titleLayer.outPoint = tClose - stagger;
    _addTextRevealAnimator(titleLayer, t0 + stagger * 2.33, 1.08, [0, 73, 0]);
    result.layers.push({ name: 'LT Title', index: titleLayer.index });

    // Reorder: text on top, flashes, bars, null at bottom
    try {
      nameLayer.moveBefore(flash1);
      titleLayer.moveAfter(nameLayer);
    } catch (eOrder) {}

    _endToolUndo();
    result.ok = true;
    result.message = 'Brand lower third created (' + result.layers.length + ' layers, "' + nameText + '" / "' + titleText + '", ' + displayDur + 's).';
    return resultToJson(result);
  } catch (e) {
    try { _endToolUndo(); } catch (x) {}
    result.message = 'brandLowerThird error: ' + e.toString();
    return resultToJson(result);
  }
}

// ── brand_text_card ────────────────────────────────────────────────────

function motionPresets_applyBrandTextCard (options) {
  var result = { ok: false, message: '', preset: 'brand_text_card', layers: [] };
  try {
    var ctx = motionPresets_resolveActiveComp();
    if (!ctx.ok || !ctx.comp) { result.message = ctx.message || 'No active composition.'; return resultToJson(result); }
    var comp = ctx.comp;
    var opts = options || {};

    var line1 = String(opts.line1 || 'Line 1');
    var line2 = String(opts.line2 || 'Line 2');
    var line3 = opts.line3 ? String(opts.line3) : null;
    var line4 = opts.line4 ? String(opts.line4) : null;
    var displayDur = 7;
    if (opts.display_duration != null && isFinite(Number(opts.display_duration))) displayDur = Math.max(3, Math.min(Number(opts.display_duration), 30));

    var allLines = [line1, line2];
    if (line3) allLines.push(line3);
    if (line4) allLines.push(line4);

    var cx = comp.width / 2;
    var cy = comp.height / 2;
    var barW = Math.min(comp.width * 0.85, 1231);
    var barH = 110;
    var lineH = 55;
    var stagger = 0.4;
    var t0 = comp.time;

    _beginToolUndo('Agent: Brand Text Card');

    // ── Parent null (controls position/scale of entire card) ──
    var ctrlNull = comp.layers.addNull();
    ctrlNull.name = 'TC Controller';
    ctrlNull.property('Transform').property('Position').setValue([cx, cy]);
    ctrlNull.property('Transform').property('Opacity').setValue(0);

    // Number of bar groups (1 bar per 2 text lines)
    var barCount = Math.ceil(allLines.length / 2);
    var totalH = barCount * barH + (barCount - 1) * 10;
    var startY = -totalH / 2 + barH / 2;

    // Create bars + text pairs (positions relative to null at comp center)
    for (var bi = 0; bi < barCount; bi++) {
      var barY = startY + bi * (barH + 10);
      var barDelay = bi * stagger;
      var tEnterStart = t0 + 0.4 + barDelay;
      var tEnterEnd = tEnterStart + 0.88;
      var tExitStart = t0 + displayDur - 0.8 - (barCount - 1 - bi) * stagger;
      var tExitEnd = tExitStart + 0.8;
      var barTarget = bi === 0 ? 102 : 80;

      // ── Shape bar ──
      var barLayer = comp.layers.addShape();
      barLayer.name = 'TC Bar ' + (bi + 1);
      var bRoot = barLayer.property('ADBE Root Vectors Group');
      var bGrp = bRoot.addProperty('ADBE Vector Group');
      bGrp.name = 'Bar';
      _addBrandRect(bGrp.property('ADBE Vectors Group'), barW, barH, _BRAND_COLORS.dark);
      barLayer.parent = ctrlNull;
      barLayer.property('Transform').property('Position').setValue([0, barY]);

      // ScaleX animation: 0→target→hold→0
      var bScale = barLayer.property('Transform').property('Scale');
      var bk0 = _setKeyAtTimeAndGetIndex(bScale, tEnterStart, [0, 100]);
      var bk1 = _setKeyAtTimeAndGetIndex(bScale, tEnterEnd, [barTarget, 100]);
      var bk2 = _setKeyAtTimeAndGetIndex(bScale, tExitStart, [barTarget, 100]);
      var bk3 = _setKeyAtTimeAndGetIndex(bScale, tExitEnd, [0, 100]);
      _setKeyEaseBezier(bScale, bk0, 33, 33);
      _setKeyEaseBezier(bScale, bk1, 100, 33);
      _setKeyEaseBezier(bScale, bk2, 100, 100);
      _setKeyEaseBezier(bScale, bk3, 33, 33);

      result.layers.push({ name: barLayer.name, index: barLayer.index });

      // ── Text lines for this bar (up to 2) ──
      for (var li = 0; li < 2; li++) {
        var lineIdx = bi * 2 + li;
        if (lineIdx >= allLines.length) break;

        var lineText = allLines[lineIdx];
        var textY = barY - lineH / 2 + li * lineH;
        var lineLayer = comp.layers.addText(lineText);
        lineLayer.name = 'TC Line ' + (lineIdx + 1);
        _setTextDoc(lineLayer, lineText, 100, _BRAND_COLORS.lightGreen, 'SBSansDisplay-Semibold', ParagraphJustification.CENTER_JUSTIFY);
        lineLayer.parent = ctrlNull;
        lineLayer.property('Transform').property('Position').setValue([0, textY]);

        // Visible only while bar is open + character reveal
        lineLayer.inPoint = tEnterEnd - 0.1;
        lineLayer.outPoint = tExitStart + 0.1;
        _addTextRevealAnimator(lineLayer, tEnterEnd - 0.1, 0.6, [0, 100, 0]);

        // Move text above bar in layer order
        try { lineLayer.moveBefore(barLayer); } catch (eM) {}

        result.layers.push({ name: lineLayer.name, index: lineLayer.index });
      }
    }

    result.layers.push({ name: 'TC Controller', index: ctrlNull.index });

    _endToolUndo();
    result.ok = true;
    result.message = 'Brand text card created (' + result.layers.length + ' layers, ' + allLines.length + ' lines, ' + displayDur + 's).';
    return resultToJson(result);
  } catch (e) {
    try { _endToolUndo(); } catch (x) {}
    result.message = 'brandTextCard error: ' + e.toString();
    return resultToJson(result);
  }
}

// ============================================================================
// Shared helpers
// ============================================================================

/**
 * Resolve a layer inside a comp by persistent id (preferred) or by index.
 * Returns the Layer or null.
 */
function _resolveLayer (comp, layerIndex, layerId) {
  var layer = null;
  // Prefer persistent id.
  if (typeof layerId === 'number' && layerId >= 0) {
    try {
      for (var li = 1; li <= comp.numLayers; li++) {
        var c = comp.layer(li);
        if (c && c.id === layerId) { layer = c; break; }
      }
    } catch (e) { layer = null; }
  }
  // Fallback to index.
  if (!layer) {
    if (typeof layerIndex === 'number' && layerIndex >= 1 && layerIndex <= comp.numLayers) {
      try { layer = comp.layer(layerIndex); } catch (e2) { layer = null; }
    }
  }
  return layer;
}

/**
 * Well-known property path → matchName fast-path map.
 * Format: "Group>Prop" → ["ADBE Group MatchName", "ADBE Prop MatchName"]
 */
var _KNOWN_PATHS = {
  'Transform>Anchor Point': ['ADBE Transform Group', 'ADBE Anchor Point'],
  'Transform>Position':     ['ADBE Transform Group', 'ADBE Position'],
  'Transform>Scale':        ['ADBE Transform Group', 'ADBE Scale'],
  'Transform>Rotation':     ['ADBE Transform Group', 'ADBE Rotate Z'],
  'Transform>X Rotation':   ['ADBE Transform Group', 'ADBE Rotate X'],
  'Transform>Y Rotation':   ['ADBE Transform Group', 'ADBE Rotate Y'],
  'Transform>Opacity':      ['ADBE Transform Group', 'ADBE Opacity'],
  'Text>Source Text':       ['ADBE Text Properties', 'ADBE Text Document'],
};

/**
 * Resolve a property on a layer given a path string like "Transform>Position",
 * "Effects>Gaussian Blur>Blurriness", etc.
 * Returns the Property/PropertyGroup or null.
 */
function _resolveProperty (layer, propertyPath) {
  if (!layer || typeof propertyPath !== 'string' || !propertyPath.length) return null;

  // Fast-path for well-known paths.
  var known = _KNOWN_PATHS[propertyPath];
  if (known) {
    try {
      var g = layer.property(known[0]);
      if (g) return g.property(known[1]);
    } catch (e) {}
    return null;
  }

  // Segment alias map: common display names → AE matchNames.
  // Allows agent to use e.g. "Masks>Mask 1>Expansion" instead of ADBE matchNames.
  var _segAlias = {
    'masks': 'ADBE Mask Parade',
    'mask parade': 'ADBE Mask Parade',
    'mask mode': 'ADBE Mask Mode',
    'mask shape': 'ADBE Mask Shape',
    'mask feather': 'ADBE Mask Feather',
    'mask opacity': 'ADBE Mask Opacity',
    'mask expansion': 'ADBE Mask Offset',
    'expansion': 'ADBE Mask Offset',
    'feather': 'ADBE Mask Feather',
    'inverted': 'ADBE Mask Inverted',
    'effects': 'ADBE Effect Parade',
    'contents': 'ADBE Root Vectors Group',
    'source text': 'ADBE Text Document',
    'text': 'ADBE Text Properties'
  };

  // Generic segment walk.
  // AE property() accepts matchNames and display names, but for shape layer
  // content the display names (e.g. "Ellipse 1") don't always resolve via
  // property(name). We try direct lookup first, then scan children by name.
  var segments = propertyPath.split('>');
  var current = layer;
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    // Check alias table first
    var segAlias = _segAlias[seg.toLowerCase()];
    if (segAlias) seg = segAlias;
    if (!seg) { current = null; break; }
    var next = null;
    // Try direct lookup (works for matchNames and most display names).
    try { next = current.property(seg); } catch (e2) { next = null; }
    // If direct lookup failed and current is a group, scan children by name.
    if (!next && current.numProperties !== undefined) {
      try {
        var segLower = seg.toLowerCase();
        // Numeric index fallback: "Mask 1", "Mask 2" etc. → property(N)
        var numMatch = segLower.match(/^(?:mask|effect|group)\s+(\d+)$/);
        if (numMatch) {
          var idx = parseInt(numMatch[1], 10);
          try { next = current.property(idx); } catch (eIdx) {}
        }
        if (!next) {
          for (var ci = 1; ci <= current.numProperties; ci++) {
            try {
              var child = current.property(ci);
              if (child && child.name && child.name.toLowerCase() === segLower) {
                next = child;
                break;
              }
            } catch (eChild) {}
          }
        }
      } catch (eScan) {}
    }
    if (!next) { current = null; break; }
    current = next;
  }
  return current;
}

/**
 * Describe a layer type as a friendly string.
 */
function resultToJson (obj) {
  // Recursive JSON stringifier for simple objects and arrays used by this panel.
  // ExtendScript does not have JSON.stringify by default in older versions, so we
  // provide a minimal, safe implementation.
  function serializeValue (value) {
    if (value === null || value === undefined) {
      return 'null';
    }
    var t = typeof value;
    if (t === 'string') {
      return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }
    if (t === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (t === 'number') {
      return value.toString();
    }
    // Arrays
    if (value instanceof Array) {
      var items = [];
      for (var i = 0; i < value.length; i++) {
        items.push(serializeValue(value[i]));
      }
      return '[' + items.join(',') + ']';
    }
    // Plain objects (best-effort; ignores prototype chain).
    var parts = [];
    for (var key in value) {
      if (!value.hasOwnProperty(key)) continue;
      parts.push('"' + key + '":' + serializeValue(value[key]));
    }
    return '{' + parts.join(',') + '}';
  }

  return serializeValue(obj);
}

