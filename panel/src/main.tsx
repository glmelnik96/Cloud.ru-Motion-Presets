// Start-up of the panel: CEP runtime -> services -> PanelApp -> UI. Outside a host the production build
// says so; the dev server (vite) shows the UI on a demo host instead (panel/src/demo.ts).
import { render } from 'preact';
import { PanelApp } from './app/controller';
import { Logger } from './core/log';
import { joinPath } from './core/paths';
import { cepRuntime } from './services/cep';
import { App, type UiServices } from './ui/App';
import { applyTheme } from './ui/theme';
import './ui/style.css';

export const PLUGIN_VERSION = __BRANDKIT_VERSION__;

declare const __BRANDKIT_VERSION__: string;

interface CepFs {
  showOpenDialogEx(multi: boolean, folders: boolean, title: string, initial: string, types: string[]): { err: number; data: string[] };
}

declare global {
  interface Window {
    cep?: { fs?: CepFs };
  }
}

const EXT: Record<string, string[]> = { photo: ['png', 'jpg', 'jpeg', 'psd', 'tif', 'tiff'], qr: ['png', 'svg'], video: ['mov', 'mp4'] };

function fileUrl(root: string, platform: 'win' | 'mac', file: string): string {
  return (platform === 'win' ? 'file:///' : 'file://') + encodeURI(joinPath(root, file));
}

async function start(el: HTMLElement): Promise<void> {
  applyTheme();
  const rt = cepRuntime();
  if (!rt) {
    if (import.meta.env.DEV) {
      const { startDemo } = await import('./demo');
      startDemo(el, PLUGIN_VERSION);
      return;
    }
    el.innerHTML = '<div class="fatal">Откройте панель в After Effects или Premiere: Window → Extensions → Cloud.ru BrandKit.</div>';
    return;
  }
  const logger = new Logger(rt.node.logFs, rt.logDir);
  const app = new PanelApp({
    host: rt.bridge,
    hostKey: rt.host,
    pluginVersion: PLUGIN_VERSION,
    platform: rt.platform,
    libraryRoot: rt.libraryRoot,
    readLibrary: async () => rt.node.readText(joinPath(rt.libraryRoot, 'library.json')),
    store: {
      get: (k) => {
        try {
          return window.localStorage.getItem(k);
        } catch {
          return null;
        }
      },
      set: (k, v) => {
        try {
          window.localStorage.setItem(k, v);
        } catch {
          // a full or blocked storage only costs the remembered values
        }
      },
    },
    logger,
    fonts: rt.fonts,
  });
  const ui: UiServices = {
    fileUrl: (file) => fileUrl(rt.libraryRoot, rt.platform, file),
    copy: (text) => rt.node.copy(text),
    pickFile: rt.host === 'ae' && window.cep?.fs
      ? async (accepts) => {
        const types = accepts.flatMap((a) => EXT[a] ?? []);
        const r = window.cep!.fs!.showOpenDialogEx(false, false, 'Файл для слота', '', types);
        return r.err === 0 && r.data.length ? r.data[0].replace(/\\/g, '/') : null;
      }
      : undefined,
  };
  render(<App app={app} ui={ui} />, el);
  await app.init();
}

void start(document.getElementById('app')!);
