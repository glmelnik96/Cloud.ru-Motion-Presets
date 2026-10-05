// The status bar (spec 7): the host and its version, the panel and library versions, the fonts, and «Скопировать
// диагностику», which puts the report (versions, the adapter's diag(), the context, the fonts) on the clipboard.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PanelApp } from '../app';
import type { FontStatus, HostKey, Item } from '../core/types';
import { browserClipboard, copyText } from './clipboard';
import { requiredFonts, statusBar, summarizeFonts } from './status';

export interface StatusBarProps {
  app: PanelApp;
  host: HostKey;
  hostVersion: string | null;
  items: Item[];
  // loading: the library is not there yet; ready: it is, so the fonts it needs are known; failed: it will not be.
  phase: 'loading' | 'ready' | 'failed';
}

type Copy = 'idle' | 'busy' | 'ok' | 'failed';

const COPY_TEXT: Readonly<Record<Copy, string>> = {
  idle: 'Скопировать диагностику',
  busy: 'Собираю…',
  ok: 'Скопировано',
  failed: 'Не удалось скопировать',
};

export function StatusBar({ app, host, hostVersion, items, phase }: StatusBarProps) {
  const ready = phase === 'ready';
  const [fonts, setFonts] = useState<FontStatus[] | null | undefined>(undefined);
  const [copy, setCopy] = useState<Copy>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!ready) return undefined;
    let alive = true;
    app.fonts().then(
      (statuses) => alive && setFonts(statuses),
      () => alive && setFonts(null),
    );
    return () => {
      alive = false;
    };
  }, [app, ready]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const info = app.info();
  const model = statusBar({
    host,
    hostVersion,
    plugin: info.plugin,
    library: info.library,
    fonts: phase === 'failed' ? null : summarizeFonts(requiredFonts(items), ready ? fonts : undefined),
  });

  const onCopy = async () => {
    if (copy === 'busy') return;
    setCopy('busy');
    let ok = false;
    try {
      ok = await copyText(JSON.stringify(await app.diagnostics(), null, 2), browserClipboard(window));
    } catch {
      ok = false;
    }
    setCopy(ok ? 'ok' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopy('idle'), 2500);
  };

  return (
    <footer class="status">
      <span class="status-item">{model.host}</span>
      <span class="status-item">{model.panel}</span>
      <span class="status-item">{model.library}</span>
      {model.fonts ? <span class={'status-item fonts ' + model.fonts.tone} title={model.fonts.text}>{model.fonts.text}</span> : null}
      <button type="button" class="link" disabled={copy === 'busy'} onClick={() => void onCopy()}>{COPY_TEXT[copy]}</button>
    </footer>
  );
}
