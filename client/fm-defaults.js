/**
 * Cloud.ru Foundation Models — defaults for Motion Presets subtitle pipeline.
 * Secrets (apiKey) live in fm-secrets.local.js (gitignored).
 */
(function (global) {
  global.FM_DEFAULTS = {
    /* Cloud.ru Evolution Foundation Models — OpenAI-compatible endpoint. */
    baseUrl: 'https://foundation-models.api.cloud.ru',

    /* Whisper model id for /v1/audio/transcriptions. */
    whisperModel: 'openai/whisper-large-v3',

    /* Per-chunk audio length in seconds.
       16 kHz mono PCM ≈ 32 KB/s → 90 s ≈ 2.88 MB → safely under 20 MB cap. */
    transcribeExportChunkSec: 90,

    /* Hard upload cap per request (Cloud.ru ~20 MB). */
    maxTranscribeUploadBytes: 20 * 1024 * 1024,

    /* Parallelism for chunk transcription. Cloud.ru tolerates up to ~20. */
    cloudConcurrency: 20,

    /* Default language passed to Whisper. */
    defaultLanguage: 'ru',

    /* Whisper response format — verbose_json gives per-segment timing. */
    responseFormat: 'verbose_json',

    /* Per-attempt fetch timeout (ms). */
    fetchTimeoutMs: 120000,

    /* Subtitle UX defaults. */
    subtitle: {
      maxCharsPerCue: 42,
      minCueSec: 0.8,
      bottomMarginPx: 96,
      fontSize: 64,
      font: 'SBSansDisplay-Semibold',
      fillColor: [1, 1, 1] /* white */
    }
  };
})(typeof window !== 'undefined' ? window : this);
