/**
 * Parallel-chunk audio transcription via ffmpeg + Cloud.ru Whisper.
 *
 * Adapted from Extensions-LLM-Chat_Pr/client/shared/timeline-transcribe.js,
 * trimmed to a single mode: take an audio/video file path + source-time range,
 * cut into ~90 s WAV chunks via ffmpeg, transcribe in parallel (≤20), merge
 * segments with timeline offsets.
 */
(function (global) {
  /* ── Promise pool with bounded concurrency ─────────────────────────── */
  function promisePool (tasks, concurrency) {
    if (!tasks.length) return Promise.resolve([]);
    var limit = Math.min(concurrency, tasks.length);
    var results = new Array(tasks.length);
    var nextIdx = 0;
    var running = 0;

    return new Promise(function (resolve, reject) {
      var rejected = false;
      function runNext () {
        while (running < limit && nextIdx < tasks.length) {
          (function (idx) {
            running++;
            nextIdx++;
            tasks[idx]().then(
              function (val) {
                if (rejected) return;
                results[idx] = val;
                running--;
                if (nextIdx >= tasks.length && running === 0) resolve(results);
                else runNext();
              },
              function (err) {
                if (!rejected) { rejected = true; reject(err); }
              }
            );
          })(nextIdx);
        }
      }
      runNext();
    });
  }

  /* ── ffmpeg discovery (CEP Node does not inherit user PATH) ────────── */
  function findFfmpegPath () {
    if (typeof require === 'undefined') return null;
    var fs = require('fs');
    var candidates = [
      '/opt/homebrew/bin/ffmpeg',     /* macOS ARM (brew) */
      '/usr/local/bin/ffmpeg',        /* macOS Intel (brew) / Linux */
      '/usr/bin/ffmpeg',              /* Linux system */
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe'
    ];
    for (var i = 0; i < candidates.length; i++) {
      try { if (fs.existsSync(candidates[i])) return candidates[i]; } catch (e) {}
    }
    try {
      var execSync = require('child_process').execSync;
      var p = process.platform === 'win32'
        ? String(execSync('where ffmpeg', { timeout: 5000 })).trim().split('\n')[0]
        : String(execSync('which ffmpeg', {
            timeout: 5000,
            env: Object.assign({}, process.env, {
              PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin'
            })
          })).trim();
      if (p && fs.existsSync(p)) return p;
    } catch (e) {}
    return null;
  }

  /* ── Slice [srcStart .. srcStart+span] into N short WAV chunks ─────── */
  function extractAudioChunksWithFfmpeg (inputPath, srcStartSec, totalSpanSec, chunkSec, progress) {
    if (typeof require === 'undefined') {
      return Promise.reject(new Error('Node.js недоступен. Проверьте --enable-nodejs в manifest.xml.'));
    }
    var ffmpegBin = findFfmpegPath();
    if (!ffmpegBin) {
      return Promise.reject(new Error(
        'ffmpeg не найден. Установите: brew install ffmpeg (macOS) или ' +
        'apt install ffmpeg (Linux). Проверены пути: /opt/homebrew/bin, /usr/local/bin, /usr/bin.'
      ));
    }
    var execFile = require('child_process').execFile;
    var os = require('os');
    var path = require('path');
    var fs = require('fs');
    var base = path.basename(inputPath, path.extname(inputPath));
    var stamp = Date.now();
    var step = Math.max(15, chunkSec || 90);
    var totalChunks = Math.max(1, Math.ceil(totalSpanSec / step));

    var chunks = [];
    var idx = 0;

    function nextChunk () {
      if (idx >= totalChunks) return Promise.resolve(chunks);
      var offset = idx * step;
      var dur = Math.min(step, totalSpanSec - offset);
      if (dur <= 0.05) return Promise.resolve(chunks);
      var outPath = path.join(os.tmpdir(), '_motionpresets_chunk_' + base + '_' + stamp + '_' + idx + '.wav');
      if (progress) progress('Извлечение аудио (ffmpeg) ' + (idx + 1) + '/' + totalChunks + '…');
      var args = [
        '-ss', String(srcStartSec + offset),
        '-t', String(dur),
        '-i', inputPath,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-y',
        outPath
      ];
      return new Promise(function (resolve, reject) {
        execFile(ffmpegBin, args, { timeout: 300000 }, function (err) {
          if (err) {
            reject(new Error('ffmpeg error (chunk ' + idx + '): ' + String(err.message || err)));
            return;
          }
          if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1024) {
            reject(new Error('ffmpeg создал пустой чанк ' + idx + ' (' + outPath + ')'));
            return;
          }
          chunks.push({ path: outPath, durationSec: dur, offsetInSpanSec: offset });
          idx++;
          resolve(nextChunk());
        });
      });
    }
    return nextChunk();
  }

  function unlinkChunkList (list) {
    if (typeof require === 'undefined' || !list) return;
    var fs = require('fs');
    list.forEach(function (c) {
      try { if (c && c.path && fs.existsSync(c.path)) fs.unlinkSync(c.path); } catch (e) {}
    });
  }

  /* ── Read file → Blob for multipart upload ─────────────────────────── */
  function readPathAsBlob (absPath) {
    if (typeof require === 'undefined') {
      throw new Error('Для чтения файла нужен Node (--enable-nodejs).');
    }
    var fs = require('fs');
    if (!fs.existsSync(absPath)) throw new Error('Файл не найден: ' + absPath);
    var buf = fs.readFileSync(absPath);
    var arr = new Uint8Array(buf);
    return new Blob([arr], { type: 'audio/wav' });
  }

  /* ── Whisper response → segments in timeline coordinates ───────────── */
  function normalizeWhisperResponse (data, timelineOffsetSec) {
    var off = typeof timelineOffsetSec === 'number' && !isNaN(timelineOffsetSec) ? timelineOffsetSec : 0;
    if (off < 0 || off > 360000) off = 0;
    var segments = [];
    if (data.segments && Array.isArray(data.segments)) {
      data.segments.forEach(function (seg) {
        var st = typeof seg.start === 'number' ? seg.start : parseFloat(seg.start) || 0;
        var en = typeof seg.end === 'number' ? seg.end : parseFloat(seg.end) || 0;
        var txt = (seg.text || '').trim();
        if (!txt) return;
        segments.push({ startSec: st + off, endSec: en + off, text: txt });
      });
    } else if (data.text) {
      segments.push({ startSec: off, endSec: off + 5, text: String(data.text).trim() });
    }
    return segments;
  }

  function mergeSegmentLists (lists) {
    var all = [];
    lists.forEach(function (list) { (list || []).forEach(function (s) { all.push(s); }); });
    all.sort(function (a, b) { return a.startSec - b.startSec; });
    return all;
  }

  function throwIfAborted (signal, abortCheck) {
    if (signal && signal.aborted) {
      var e = new Error('Остановлено пользователем');
      e.name = 'AbortError';
      throw e;
    }
    if (typeof abortCheck === 'function' && abortCheck()) {
      var e2 = new Error('Остановлено пользователем');
      e2.name = 'AbortError';
      throw e2;
    }
  }

  /**
   * Top-level orchestrator.
   *
   * opt: {
   *   inputPath:        absolute path to source audio/video file,
   *   srcStartSec:      where to begin reading inside source (e.g. layer.inPoint - layer.startTime),
   *   spanSec:          how much to read,
   *   timelineOffsetSec: number to add to every chunk's startSec/endSec
   *                     so cues line up on the AE comp timeline,
   *   settings:         { baseUrl, apiKey, whisperModel, transcribeExportChunkSec, cloudConcurrency,
   *                       defaultLanguage, responseFormat, fetchTimeoutMs },
   *   signal, abortCheck, onProgress
   * }
   * Returns { segments: [{startSec, endSec, text}], chunkCount, raw }.
   */
  async function transcribeRange (opt) {
    var settings = opt.settings || {};
    var progress = typeof opt.onProgress === 'function' ? opt.onProgress : function () {};
    var CC = global.CloudRuClient;
    if (!CC) throw new Error('CloudRuClient не загружен (проверьте script-теги в index.html).');

    var chunkSec = settings.transcribeExportChunkSec || 90;
    var concurrency = settings.cloudConcurrency || 20;

    throwIfAborted(opt.signal, opt.abortCheck);

    progress('Извлечение аудио ffmpeg на 16 kHz mono PCM…');
    var chunks = await extractAudioChunksWithFfmpeg(
      opt.inputPath, opt.srcStartSec || 0, opt.spanSec, chunkSec, progress
    );
    throwIfAborted(opt.signal, opt.abortCheck);

    var transcribeOptsBase = {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.whisperModel,
      transcribeParams: {
        language: settings.defaultLanguage || 'ru',
        response_format: settings.responseFormat || 'verbose_json'
      },
      signal: opt.signal,
      abortCheck: opt.abortCheck,
      timeoutMs: settings.fetchTimeoutMs
    };

    var totalChunks = chunks.length;
    var done = 0;
    progress('Транскрибация: отправляю ' + totalChunks + ' фрагментов параллельно (×' + Math.min(concurrency, totalChunks) + ')…');

    try {
      var tasks = chunks.map(function (ch, i) {
        return function () {
          var blob = readPathAsBlob(ch.path);
          return CC.transcribeAudio(Object.assign({}, transcribeOptsBase, {
            fileBlob: blob,
            fileName: 'chunk_' + i + '.wav'
          })).then(function (data) {
            done++;
            progress('Транскрибация: ' + done + '/' + totalChunks + ' готово…');
            return { index: i, data: data, offset: (opt.timelineOffsetSec || 0) + ch.offsetInSpanSec };
          });
        };
      });

      var results = await promisePool(tasks, concurrency);
      results.sort(function (a, b) { return a.index - b.index; });

      var allSegments = [];
      for (var ri = 0; ri < results.length; ri++) {
        allSegments = allSegments.concat(normalizeWhisperResponse(results[ri].data, results[ri].offset));
      }

      return {
        segments: mergeSegmentLists([allSegments]),
        chunkCount: totalChunks,
        raw: results.map(function (r) { return { index: r.index, offset: r.offset }; })
      };
    } finally {
      unlinkChunkList(chunks);
    }
  }

  /* ── Cue post-processing: split long segments, dedup, enforce min len ── */
  function splitLongCues (segments, maxChars, minDurSec) {
    if (!segments || !segments.length) return [];
    maxChars = maxChars || 42;
    minDurSec = minDurSec || 0.8;
    var out = [];
    for (var i = 0; i < segments.length; i++) {
      var s = segments[i];
      var text = String(s.text || '').trim();
      if (!text) continue;
      if (text.length <= maxChars) {
        out.push({ startSec: s.startSec, endSec: Math.max(s.endSec, s.startSec + minDurSec), text: text });
        continue;
      }
      /* Split by sentence boundary first, then by word with char cap. */
      var parts = splitByLength(text, maxChars);
      var totalSpan = Math.max(s.endSec - s.startSec, parts.length * minDurSec);
      var perPart = totalSpan / parts.length;
      for (var p = 0; p < parts.length; p++) {
        var t0 = s.startSec + p * perPart;
        var t1 = s.startSec + (p + 1) * perPart;
        out.push({ startSec: t0, endSec: t1, text: parts[p] });
      }
    }
    /* Prevent overlap: clamp end to next start. */
    for (var k = 0; k < out.length - 1; k++) {
      if (out[k].endSec > out[k + 1].startSec) out[k].endSec = out[k + 1].startSec;
      if (out[k].endSec - out[k].startSec < 0.2) out[k].endSec = out[k].startSec + 0.2;
    }
    return out;
  }

  function splitByLength (text, maxChars) {
    var words = text.split(/\s+/);
    var lines = [];
    var cur = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!cur.length) { cur = w; continue; }
      if (cur.length + 1 + w.length <= maxChars) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    }
    if (cur.length) lines.push(cur);
    return lines;
  }

  global.TimelineTranscribe = {
    transcribeRange: transcribeRange,
    splitLongCues: splitLongCues,
    findFfmpegPath: findFfmpegPath,
    promisePool: promisePool
  };
})(typeof window !== 'undefined' ? window : this);
