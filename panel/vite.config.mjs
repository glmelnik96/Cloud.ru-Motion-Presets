// The Cloud.ru BrandKit panel for CEP 12 (Chromium 99). dist/ is the extension root: public/CSXS/manifest.xml
// is copied as is, tools/panel/build.mjs adds dist/host/*.jsx (and dist/.debug in dev builds) after this build.
// CEP opens the panel from file://, where module scripts need CORS, so the bundle is an IIFE loaded by a classic
// deferred script; Vite 8 also marks stylesheets crossorigin, which file:// does not need either.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('./version.json', import.meta.url), 'utf8'));

const classicScripts = {
  name: 'cep-classic-scripts',
  enforce: 'post',
  generateBundle(_options, bundle) {
    for (const f of Object.values(bundle)) {
      if (f.type === 'asset' && f.fileName.endsWith('.html')) {
        f.source = String(f.source)
          .replace(/<script type="module" crossorigin/g, '<script defer')
          .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"');
      }
    }
  },
};

export default defineConfig(({ mode }) => ({
  root,
  base: './',
  plugins: [classicScripts],
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  define: {
    __CRBK_VERSION__: JSON.stringify(version),
    __CRBK_BUILD__: JSON.stringify(process.env.CRBK_BUILD || 'dev'),
    __CRBK_DEV__: JSON.stringify(mode === 'development'),
  },
  build: {
    target: 'chrome99',
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    sourcemap: false,
    rollupOptions: { output: { format: 'iife' } },
  },
}));
