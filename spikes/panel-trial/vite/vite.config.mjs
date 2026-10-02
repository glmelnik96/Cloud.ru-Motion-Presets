// Own-Vite trial of task 29: a Preact panel for CEP 12 (Chromium 99) with relative paths.
// public/CSXS/manifest.xml is copied to dist/CSXS/manifest.xml as is, so dist/ is the extension root.
// CEP opens the panel from file://, where module scripts need CORS; the bundle is therefore an IIFE
// loaded by a classic deferred script.
import { defineConfig } from 'vite';

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

export default defineConfig({
  base: './',
  plugins: [classicScripts],
  build: {
    target: 'chrome99',
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: { output: { format: 'iife' } },
  },
});
