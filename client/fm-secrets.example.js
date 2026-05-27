/**
 * Template for Cloud.ru API credentials.
 *
 * SETUP:
 *   1. cp client/fm-secrets.example.js client/fm-secrets.local.js
 *   2. Open client/fm-secrets.local.js and fill in your apiKey.
 *   3. fm-secrets.local.js is gitignored — your key stays local.
 */
(function (global) {
  global.FM_SECRETS = {
    /* Cloud.ru Evolution Foundation Models API key.
       Get from https://console.cloud.ru → Foundation Models → API keys. */
    apiKey: ''
  };
})(typeof window !== 'undefined' ? window : this);
