/**
 * Subtitle pipeline for Cloud.ru Motion Presets (After Effects).
 *
 * Bridges three pieces:
 *   1. AE host script    — resolves source file path of the selected layer
 *   2. TimelineTranscribe — ffmpeg-chunks + parallel Cloud.ru Whisper
 *   3. AE host script    — creates N text layers with proper timing
 *
 * Exposes window.SubtitlePipeline.transcribeAndCreate(opts).
 */
(function (global) {
  function getSettings () {
    var defaults = global.FM_DEFAULTS || {};
    var secrets = global.FM_SECRETS || {};
    return {
      baseUrl: defaults.baseUrl,
      apiKey: secrets.apiKey,
      whisperModel: defaults.whisperModel,
      transcribeExportChunkSec: defaults.transcribeExportChunkSec,
      cloudConcurrency: defaults.cloudConcurrency,
      defaultLanguage: defaults.defaultLanguage,
      responseFormat: defaults.responseFormat,
      fetchTimeoutMs: defaults.fetchTimeoutMs,
      subtitle: defaults.subtitle || {}
    };
  }

  /**
   * opts: {
   *   layerIndex:          int — index in active comp,
   *   layerId:             int|null — preferred resolution key,
   *   maxCharsPerCue:      number,
   *   minCueSec:           number,
   *   language:            string ("ru" by default),
   *   fontSize:            number,
   *   font:                string,
   *   fillColor:           [r,g,b] in 0..1,
   *   bottomMarginPx:      number,
   *   animation:           'none' | 'fade' | 'char_reveal',
   *   parentToNull:        boolean,
   *   onProgress:          function(string),
   *   abortCheck:          function() -> bool
   * }
   */
  async function transcribeAndCreate (opts) {
    var bridge = global.HOST_BRIDGE;
    if (!bridge || typeof bridge.executeToolCall !== 'function') {
      throw new Error('HOST_BRIDGE недоступен.');
    }

    var settings = getSettings();
    if (!settings.apiKey) {
      throw new Error('API ключ не задан. Заполните apiKey в client/fm-secrets.local.js.');
    }

    var progress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};

    /* 1. Resolve source path & timing for the selected layer. */
    progress('Получаю источник аудио из выделенного слоя…');
    var src = await bridge.executeToolCall('get_audio_source', {
      layer_index: opts.layerIndex,
      layer_id: opts.layerId || null
    });
    if (!src || !src.ok) {
      throw new Error((src && src.message) || 'Не удалось получить источник аудио.');
    }
    if (!src.fsPath) {
      throw new Error('У выделенного слоя нет файлового источника (footage). Поддерживается только AVLayer с файловым source.');
    }
    var span = (src.layerOutPoint || 0) - (src.layerInPoint || 0);
    if (!isFinite(span) || span <= 0.1) {
      throw new Error('Длина диапазона слоя <= 0. Проверьте inPoint/outPoint.');
    }

    /* 2. Run parallel transcription. */
    var settingsForCall = Object.assign({}, settings, {
      defaultLanguage: opts.language || settings.defaultLanguage
    });
    var TT = global.TimelineTranscribe;
    if (!TT) throw new Error('TimelineTranscribe не загружен.');

    var transcribeResult = await TT.transcribeRange({
      inputPath: src.fsPath,
      srcStartSec: src.sourceStartInLayer || 0,
      spanSec: span,
      timelineOffsetSec: src.layerInPoint || 0,
      settings: settingsForCall,
      abortCheck: opts.abortCheck,
      onProgress: progress
    });

    progress('Получено сегментов от Whisper: ' + transcribeResult.segments.length);

    /* 3. Post-process: split long cues, enforce min duration. */
    var cues = TT.splitLongCues(
      transcribeResult.segments,
      opts.maxCharsPerCue || settings.subtitle.maxCharsPerCue || 42,
      opts.minCueSec || settings.subtitle.minCueSec || 0.8
    );

    if (!cues.length) {
      return { ok: true, message: 'Транскрипция вернула 0 сегментов — субтитры не созданы.', cuesCreated: 0, chunkCount: transcribeResult.chunkCount };
    }

    /* 4. Hand off to AE host to batch-create text layers. */
    progress('Создаю ' + cues.length + ' текстовых слоёв в композиции…');
    var sub = settings.subtitle || {};
    var createRes = await bridge.executeToolCall('create_subtitle_layers', {
      cues: cues,
      style: {
        fontSize: opts.fontSize || sub.fontSize || 64,
        font: opts.font || sub.font || 'SBSansDisplay-Semibold',
        fillColor: opts.fillColor || sub.fillColor || [1, 1, 1],
        bottomMarginPx: opts.bottomMarginPx || sub.bottomMarginPx || 96
      },
      animation: opts.animation || 'fade',
      parent_to_null: opts.parentToNull !== false
    });

    if (!createRes || !createRes.ok) {
      throw new Error((createRes && createRes.message) || 'Не удалось создать слои субтитров.');
    }

    return {
      ok: true,
      message: 'Создано слоёв: ' + createRes.layersCreated + ', чанков транскрибировано: ' + transcribeResult.chunkCount,
      cuesCreated: createRes.layersCreated,
      chunkCount: transcribeResult.chunkCount,
      controllerLayerIndex: createRes.controllerLayerIndex || null
    };
  }

  global.SubtitlePipeline = {
    transcribeAndCreate: transcribeAndCreate,
    getSettings: getSettings
  };
})(typeof window !== 'undefined' ? window : this);
