/**
 * Cloud.ru Evolution Foundation Models — minimal client for /v1/audio/transcriptions.
 * Adapted from Extensions-LLM-Chat_Pr/client/shared/cloudru-client.js, trimmed to
 * just the transcription endpoint (no chat, no SSE).
 *
 * Features:
 *   - Retry 3× with exponential backoff + jitter on 5xx/429.
 *   - Per-attempt AbortController with 120 s timeout.
 *   - Friendly 413 (payload too large) detection.
 */
(function (global) {
  function normalizeBase (url) {
    if (!url || typeof url !== 'string') return '';
    return url.replace(/\/+$/, '');
  }

  function apiV1Root (baseUrl) {
    var b = normalizeBase(baseUrl);
    if (!b) return '';
    return /\/v1$/i.test(b) ? b : b + '/v1';
  }

  function parseJsonResponse (text, errPrefix) {
    try {
      return JSON.parse(text);
    } catch (e) {
      var hint = /<\s*!?\s*DOCTYPE|<\s*html/i.test(text)
        ? ' (HTML вместо JSON — часто неверный URL API или 413.)'
        : '';
      throw new Error((errPrefix || 'Ответ не JSON') + ': ' + text.slice(0, 200) + hint);
    }
  }

  function throwIfAbortCheck (abortCheck) {
    if (typeof abortCheck === 'function' && abortCheck()) {
      var err = new Error('Остановлено пользователем');
      err.name = 'AbortError';
      throw err;
    }
  }

  function isPayloadTooLarge (status, text) {
    if (status === 413) return true;
    /* For 2xx, do not scan body — Whisper verbose_json may contain literal "413"
       inside token IDs, which would falsely trigger the heuristic. */
    if (status >= 200 && status < 300) return false;
    var head = String(text || '').slice(0, 600);
    return /\b413\b|Payload Too Large/i.test(head);
  }

  function isRetryable (status) {
    return status >= 500 || status === 429;
  }

  function sleep (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  var MAX_RETRIES = 3;
  var BASE_DELAY_MS = 1000;
  var DEFAULT_TIMEOUT_MS = 120000;

  async function fetchWithRetry (url, fetchOpts, abortCheck, opts) {
    opts = opts || {};
    var timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    var lastErr = null;
    for (var attempt = 0; attempt < MAX_RETRIES; attempt++) {
      throwIfAbortCheck(abortCheck);

      var ctrl = null;
      var tmId = null;
      var mergedOpts = fetchOpts;
      if (typeof AbortController !== 'undefined' && timeoutMs > 0) {
        ctrl = new AbortController();
        tmId = setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, timeoutMs);
        mergedOpts = Object.assign({}, fetchOpts, { signal: ctrl.signal });
        if (fetchOpts && fetchOpts.signal) {
          try {
            fetchOpts.signal.addEventListener('abort', function () {
              try { ctrl.abort(); } catch (_) {}
            });
          } catch (_) {}
        }
      }

      try {
        var res = await fetch(url, mergedOpts);
        if (tmId) clearTimeout(tmId);
        if (!isRetryable(res.status) || attempt === MAX_RETRIES - 1) return res;
        lastErr = new Error('HTTP ' + res.status);
      } catch (fetchErr) {
        if (tmId) clearTimeout(tmId);
        if (fetchErr && fetchErr.name === 'AbortError') {
          if (typeof abortCheck === 'function' && abortCheck()) throw fetchErr;
          lastErr = new Error('Таймаут запроса (' + (timeoutMs / 1000).toFixed(0) + 'с)');
          if (attempt === MAX_RETRIES - 1) throw lastErr;
        } else {
          if (attempt === MAX_RETRIES - 1) throw fetchErr;
          lastErr = fetchErr;
        }
      }
      var base = BASE_DELAY_MS * Math.pow(2, attempt);
      var jitter = base * 0.2 * (Math.random() * 2 - 1);
      await sleep(Math.round(base + jitter));
    }
    throw lastErr || new Error('Retry exhausted');
  }

  global.CloudRuClient = {
    /**
     * POST /v1/audio/transcriptions (multipart).
     *
     * opts: {
     *   baseUrl, apiKey, model,
     *   fileBlob, fileName,
     *   transcribeParams: { language, response_format, temperature },
     *   signal, abortCheck, timeoutMs
     * }
     * Returns Whisper response (verbose_json by default):
     *   { text, segments: [{start, end, text, ...}], language, duration }
     */
    transcribeAudio: async function (opts) {
      var base = normalizeBase(opts.baseUrl);
      var apiKey = opts.apiKey;
      var model = opts.model || 'openai/whisper-large-v3';
      if (!base) throw new Error('CloudRuClient: baseUrl не задан (см. client/fm-defaults.js).');
      if (!apiKey) throw new Error('CloudRuClient: apiKey пустой (см. client/fm-secrets.local.js).');

      var url = apiV1Root(base) + '/audio/transcriptions';
      var form = new FormData();
      form.append('file', opts.fileBlob, opts.fileName || 'audio.wav');
      form.append('model', model);
      var tx = opts.transcribeParams || {};
      if (tx.language) form.append('language', String(tx.language));
      var rf = tx.response_format || 'verbose_json';
      form.append('response_format', String(rf));
      if (tx.temperature !== undefined && tx.temperature !== null) {
        form.append('temperature', String(tx.temperature));
      }

      var fetchOpts = {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey },
        body: form
      };
      if (opts.signal) fetchOpts.signal = opts.signal;
      throwIfAbortCheck(opts.abortCheck);

      var res = await fetchWithRetry(url, fetchOpts, opts.abortCheck, { timeoutMs: opts.timeoutMs });
      throwIfAbortCheck(opts.abortCheck);

      var text = await res.text();
      if (isPayloadTooLarge(res.status, text)) {
        throw new Error(
          '413 Payload Too Large — аудио слишком большое для API. ' +
          'Уменьшите transcribeExportChunkSec в fm-defaults.js или установите ffmpeg.'
        );
      }
      var data = parseJsonResponse(text, 'Транскрипция: не JSON');
      if (!res.ok) {
        throw new Error(data.error && data.error.message ? data.error.message : text.slice(0, 300));
      }
      return data;
    }
  };
})(typeof window !== 'undefined' ? window : this);
