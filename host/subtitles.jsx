/**
 * ExtendScript host functions for the subtitle pipeline.
 *
 * Loaded after host/index.jsx so it can reuse helpers:
 *   motionPresets_resolveActiveComp, _resolveLayer, _setTextDoc,
 *   _setKeyAtTimeAndGetIndex, _setKeyEaseBezier, _addTextRevealAnimator,
 *   _beginToolUndo, _endToolUndo, resultToJson.
 *
 * Public functions called from the panel via hostBridge:
 *   motionPresets_getAudioSourceForLayer(layerIndex, layerId)
 *   motionPresets_createSubtitleLayers(cuesArray, styleObj, animation, parentToNull)
 */

/**
 * Resolve the on-disk source file for an AVLayer plus its timeline range.
 *
 * Returns JSON:
 *   { ok, message, fsPath, layerInPoint, layerOutPoint, sourceStartInLayer,
 *     compFps, compWidth, compHeight, layerName }
 */
function motionPresets_getAudioSourceForLayer (layerIndex, layerId) {
  var result = {
    ok: false,
    message: '',
    fsPath: '',
    layerInPoint: 0,
    layerOutPoint: 0,
    sourceStartInLayer: 0,
    compFps: 0,
    compWidth: 0,
    compHeight: 0,
    layerName: ''
  };
  try {
    var ctx = motionPresets_resolveActiveComp();
    if (!ctx.ok || !ctx.comp) {
      result.message = ctx.message || 'No active composition.';
      return resultToJson(result);
    }
    var comp = ctx.comp;
    result.compFps = comp.frameRate;
    result.compWidth = comp.width;
    result.compHeight = comp.height;

    var layer = _resolveLayer(comp, layerIndex, layerId);
    if (!layer) {
      result.message = 'Layer not resolved (index=' + layerIndex + ', id=' + layerId + ').';
      return resultToJson(result);
    }
    result.layerName = String(layer.name || '');

    /* AVLayer footage check */
    if (!(layer instanceof AVLayer)) {
      result.message = 'Слой не AVLayer (тип ' + (layer.matchName || layer.constructor.name) + '). Выделите аудио или видео слой.';
      return resultToJson(result);
    }
    var src = layer.source;
    if (!src) {
      result.message = 'У слоя нет source.';
      return resultToJson(result);
    }
    if (!(src instanceof FootageItem)) {
      result.message = 'Source — не FootageItem (precomp/solid/text не поддерживаются для транскрибации).';
      return resultToJson(result);
    }
    var f = src.mainSource ? src.mainSource.file : null;
    if (!f) {
      result.message = 'У footage нет файла на диске (sequence/synthetic source).';
      return resultToJson(result);
    }
    result.fsPath = String(f.fsName);

    /* Layer timeline range in comp seconds */
    result.layerInPoint = layer.inPoint;
    result.layerOutPoint = layer.outPoint;

    /* Where in the source file does layer.inPoint correspond to?
       AE: source-time-at-comp-time(t) = (t - layer.startTime) / layer.timeRemap (no remap → 1)
       For non-remapped layer: sourceTime(t) = t - layer.startTime
       So at t = layer.inPoint: sourceStart = layer.inPoint - layer.startTime. */
    result.sourceStartInLayer = layer.inPoint - layer.startTime;
    if (result.sourceStartInLayer < 0) result.sourceStartInLayer = 0;

    result.ok = true;
    result.message = 'Source resolved: ' + result.fsPath;
    return resultToJson(result);
  } catch (e) {
    result.ok = false;
    result.message = 'motionPresets_getAudioSourceForLayer error: ' + e.toString();
    return resultToJson(result);
  }
}

/**
 * Batch-create text layers for an array of cues.
 *
 * cuesArray:  [{startSec, endSec, text}, ...]   (timeline-coordinate seconds)
 * styleObj:   { fontSize, font, fillColor:[r,g,b], bottomMarginPx }
 * animation:  'none' | 'fade' | 'char_reveal'
 * parentToNull: true → all layers parented to a single null controller
 *
 * Returns JSON:
 *   { ok, message, layersCreated, controllerLayerIndex|null, layerIndices:[…] }
 */
function motionPresets_createSubtitleLayers (cuesArray, styleObj, animation, parentToNull) {
  var result = {
    ok: false,
    message: '',
    layersCreated: 0,
    controllerLayerIndex: null,
    layerIndices: []
  };
  try {
    var ctx = motionPresets_resolveActiveComp();
    if (!ctx.ok || !ctx.comp) {
      result.message = ctx.message || 'No active composition.';
      return resultToJson(result);
    }
    var comp = ctx.comp;

    if (!cuesArray || !cuesArray.length) {
      result.message = 'cuesArray empty.';
      return resultToJson(result);
    }
    var style = styleObj || {};
    var fontSize = (typeof style.fontSize === 'number') ? style.fontSize : 64;
    var fillColor = (style.fillColor && style.fillColor.length === 3)
      ? [style.fillColor[0], style.fillColor[1], style.fillColor[2]]
      : [1, 1, 1];
    var fontName = style.font || 'SBSansDisplay-Semibold';
    var bottomMarginPx = (typeof style.bottomMarginPx === 'number') ? style.bottomMarginPx : 96;
    var anim = String(animation || 'fade');
    var doParent = (parentToNull === true || parentToNull === undefined);

    _beginToolUndo('Subtitles: create ' + cuesArray.length + ' cues');
    try {
      var nullCtrl = null;
      if (doParent) {
        nullCtrl = comp.layers.addNull(comp.duration);
        nullCtrl.name = 'Subtitles Controller';
        try { nullCtrl.label = 9; /* green */ } catch (eL) {}
        try { nullCtrl.guideLayer = true; } catch (eG) {}
        try { nullCtrl.transform.opacity.setValue(0); } catch (eO) {}
        try { nullCtrl.startTime = 0; } catch (eS) {}
        result.controllerLayerIndex = nullCtrl.index;
      }

      var posX = comp.width / 2;
      var posY = comp.height - bottomMarginPx;

      for (var i = 0; i < cuesArray.length; i++) {
        var cue = cuesArray[i];
        var startSec = (typeof cue.startSec === 'number') ? cue.startSec : 0;
        var endSec = (typeof cue.endSec === 'number') ? cue.endSec : startSec + 1;
        if (endSec <= startSec) endSec = startSec + 0.5;
        var text = String(cue.text || '');
        if (!text.length) continue;

        var txt = comp.layers.addText(text);
        txt.name = 'Sub ' + (i + 1).toString();
        txt.startTime = 0;
        txt.inPoint = startSec;
        txt.outPoint = endSec;

        /* Apply text document style (font, size, color, center justification) */
        try {
          _setTextDoc(txt, text, fontSize, fillColor, fontName, ParagraphJustification.CENTER_JUSTIFY);
        } catch (eDoc) {
          /* Fallback without ParagraphJustification (older AE) */
          try { _setTextDoc(txt, text, fontSize, fillColor, fontName); } catch (eDoc2) {}
        }

        /* Anchor + position: center-bottom of comp */
        try { txt.transform.position.setValue([posX, posY]); } catch (ePos) {}

        /* Per-cue entry animation */
        if (anim === 'fade') {
          var op = txt.transform.opacity;
          var fadeIn = Math.min(0.15, (endSec - startSec) * 0.25);
          var fadeOut = Math.min(0.15, (endSec - startSec) * 0.25);
          var k0 = _setKeyAtTimeAndGetIndex(op, startSec, 0);
          var k1 = _setKeyAtTimeAndGetIndex(op, startSec + fadeIn, 100);
          var k2 = _setKeyAtTimeAndGetIndex(op, endSec - fadeOut, 100);
          var k3 = _setKeyAtTimeAndGetIndex(op, endSec, 0);
          try {
            _setKeyEaseBezier(op, k0, 33.3, 33.3);
            _setKeyEaseBezier(op, k1, 33.3, 33.3);
            _setKeyEaseBezier(op, k2, 33.3, 33.3);
            _setKeyEaseBezier(op, k3, 33.3, 33.3);
          } catch (eEase) {}
        } else if (anim === 'char_reveal') {
          try {
            var revealDur = Math.min(0.5, (endSec - startSec) * 0.4);
            _addTextRevealAnimator(txt, startSec, revealDur, [0, 20, 0]);
          } catch (eAnim) {}
        }
        /* anim === 'none' → no extra keyframes */

        if (nullCtrl) {
          try { txt.parent = nullCtrl; } catch (eP) {}
        }

        result.layerIndices.push(txt.index);
        result.layersCreated++;
      }

      result.ok = true;
      result.message = 'Created ' + result.layersCreated + ' subtitle layer(s).';
      return resultToJson(result);
    } finally {
      _endToolUndo();
    }
  } catch (eOuter) {
    result.ok = false;
    result.message = 'motionPresets_createSubtitleLayers error: ' + eOuter.toString();
    return resultToJson(result);
  }
}
