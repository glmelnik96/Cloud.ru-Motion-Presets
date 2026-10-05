// Entry of the panel: the app is made from the CEP window (services, bridge, core flow), the dev test hook is put on
// the window before anything renders (the live E2E waits for it after a reload), then the UI draws.
import { render } from 'preact';
import { createApp, createTestHook } from './app';
import { App } from './ui/App';
import './ui/tokens.css';
import './ui/styles.css';

const app = createApp({ win: window });

// Only in a dev build (tools/panel/build.mjs --dev): a release panel has no way in for a script.
if (__CRBK_DEV__) {
  (window as unknown as { __crbkTest?: unknown }).__crbkTest = createTestHook(app);
}

render(<App app={app} />, document.getElementById('app') as HTMLElement);
