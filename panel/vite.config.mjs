// Build of the CEP panel with the repo's own Vite (decision A5, docs/decisions/panel-framework.md):
//   npm run panel:build  ->  panel/dist = the extension root (index.html, assets, host/, CSXS/)
// CEP opens the page from file://, where module scripts need CORS: the bundle is one IIFE loaded by a classic
// deferred script, as in the trial (spikes/panel-trial/vite). Target Chromium 99 (CEP 12).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { composeHost } from './host/compose.mjs';
import { manifestXml } from './manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf8'));

const classicScripts = {
  name: 'cep-classic-scripts',
  enforce: 'post',
  generateBundle(_options, bundle) {
    for (const f of Object.values(bundle)) {
      if (f.type === 'asset' && f.fileName.endsWith('.html')) {
        f.source = String(f.source).replace(/<script type="module" crossorigin/g, '<script defer');
      }
    }
  },
};

// The host bundle (panel/host) and the manifest are written into the extension with the plugin version.
const extensionFiles = {
  name: 'cep-extension-files',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'host/brandkit.jsx', source: composeHost({ version }) });
    this.emitFile({ type: 'asset', fileName: 'CSXS/manifest.xml', source: manifestXml({ version }) });
  },
};

export default defineConfig({
  root: here,
  base: './',
  plugins: [classicScripts, extensionFiles],
  define: { __BRANDKIT_VERSION__: JSON.stringify(version) },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    target: 'chrome99',
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    assetsInlineLimit: 0,
    rollupOptions: { output: { format: 'iife' } },
  },
});
