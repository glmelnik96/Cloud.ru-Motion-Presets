// The panel (plan 2026-10-05, task 9): loads the library, shows the catalog or the form of one item, and keeps the
// header's format chip true. It polls nothing: the context is read once at start, when the panel gets the focus,
// when it becomes visible, and before every insert (the app does that last one itself). The catalog shows as soon as
// the library is read; a host that is slow or does not answer only adds a banner.
import { Component, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { hostIssue, type CatalogResult, type PanelApp } from '../app';
import type { HostContext, Issue } from '../core/types';
import { ALL } from './catalog';
import { Catalog } from './CatalogGrid';
import { formatChip, hasExactVariant } from './format';
import { Header } from './Header';
import { IssueList } from './IssueList';
import { bannerIssues, describeIssue } from './issues';
import { ItemForm } from './ItemForm';
import { StatusBar } from './StatusBar';

type CtxState = { status: 'loading' } | { status: 'ok'; ctx: HostContext } | { status: 'error'; issue: Issue };

function Problem({ issues, onRetry }: { issues: Issue[]; onRetry(): void }) {
  return (
    <section class="problem" role="alert">
      <h2 class="problem-title">Панель не готова к работе</h2>
      <IssueList lines={issues.map(describeIssue)} />
      <button type="button" class="primary" onClick={onRetry}>Повторить</button>
    </section>
  );
}

function Banner({ issues, onRetry }: { issues: Issue[]; onRetry(): void }) {
  if (issues.length === 0) return null;
  return (
    <div class="banner" role="alert">
      <IssueList lines={issues.map(describeIssue)} />
      <button type="button" class="link" onClick={onRetry}>Повторить</button>
    </div>
  );
}

function Shell({ app }: { app: PanelApp }) {
  const [cat, setCat] = useState<CatalogResult | null>(null);
  const [adapterIssue, setAdapterIssue] = useState<Issue | null>(null);
  const [ctx, setCtx] = useState<CtxState>({ status: 'loading' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
  const [, repaint] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const scrolled = useRef(0); // where the catalog was when an item was opened
  const asking = useRef(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    try {
      const reply = await app.context();
      if (alive.current) setCtx(reply.ok ? { status: 'ok', ctx: reply.data } : { status: 'error', issue: hostIssue(reply.error) });
    } finally {
      asking.current = false;
    }
  }, [app]);

  // start() goes first: its adapter check must be in the bridge's queue before the first context read.
  const load = useCallback(
    (starting: ReturnType<PanelApp['start']>) => {
      void app.catalog().then((result) => alive.current && setCat(result));
      void starting.then((result) => alive.current && setAdapterIssue(result.adapterIssue));
    },
    [app],
  );

  const retry = useCallback(() => {
    setCat(null);
    setAdapterIssue(null);
    load(app.reload());
    void refresh();
  }, [app, load, refresh]);

  useEffect(() => {
    alive.current = true;
    load(app.start());
    void refresh();
    const onFocus = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [app, load, refresh]);

  // The catalog keeps its place when an item is closed again.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = openId ? 0 : scrolled.current;
  }, [openId]);

  const open = (id: string) => {
    scrolled.current = scroller.current?.scrollTop ?? 0;
    setOpenId(id);
  };

  const host = app.info().host ?? 'pr';
  const items = cat?.items ?? [];
  const openItem = openId ? items.find((i) => i.id === openId) ?? null : null;
  const target = ctx.status === 'ok' ? ctx.ctx.target : ctx.status === 'loading' ? undefined : null;
  const manualKey = openItem && target ? app.manualVariant(openItem, target) : null;
  // Without an item open the chip speaks for the whole catalog: is there any template that fits this frame?
  const anyExact = !target || items.length === 0 ? undefined : hasExactVariant(items, target);
  const chip = formatChip({ host, reachable: ctx.status !== 'error', target, item: openItem, manualKey, anyExact });
  const hostVersion = ctx.status === 'ok' ? ctx.ctx.hostVersion : app.info().hostVersion;

  // What does not stop the catalog from showing (the adapter did not answer, the host is out of reach) is a banner.
  const banner = bannerIssues({ adapterIssue, hostIssue: ctx.status === 'error' ? ctx.issue : null, hostOk: ctx.status === 'ok' });

  // The form scrolls inside itself, under the header and above its own button; every other screen is one scroller.
  let body: ComponentChildren;
  if (cat === null) {
    body = <div class="scroll"><p class="loading">Загружаю библиотеку…</p></div>;
  } else if (!cat.library || cat.root === null) {
    body = <div class="scroll"><Problem issues={cat.issues} onRetry={retry} /></div>;
  } else {
    body = (
      <>
        <Banner issues={banner} onRetry={retry} />
        {openItem ? (
          <ItemForm
            key={openItem.id}
            app={app}
            item={openItem}
            host={host}
            root={cat.root}
            onBack={() => setOpenId(null)}
            onInserted={() => void refresh()}
          />
        ) : (
          <div class="scroll" ref={scroller}>
            <Catalog items={items} root={cat.root} query={query} category={category} onQuery={setQuery} onCategory={setCategory} onOpen={open} />
          </div>
        )}
      </>
    );
  }

  return (
    <div class="app">
      <Header
        chip={chip}
        onPick={(key) => {
          if (!openItem || !target) return;
          app.setManualVariant(openItem, target, key);
          repaint((n) => n + 1);
        }}
      />
      <main class="main">{body}</main>
      <StatusBar
        app={app}
        host={host}
        hostVersion={hostVersion}
        items={items}
        phase={cat === null ? 'loading' : cat.library ? 'ready' : 'failed'}
      />
    </div>
  );
}

// A view that throws must not leave a blank panel: say so, and what the error was.
class Boundary extends Component<{ children?: ComponentChildren }, { error: string | null }> {
  override state = { error: null as string | null };

  override componentDidCatch(error: unknown): void {
    this.setState({ error: error instanceof Error ? error.message : String(error) });
  }

  override render() {
    if (this.state.error === null) return this.props.children;
    return (
      <section class="problem" role="alert">
        <h2 class="problem-title">Ошибка интерфейса</h2>
        <p class="issue error">{this.state.error}</p>
        <p class="hint">Закройте и снова откройте панель. Если ошибка повторяется, передайте её текст разработчикам.</p>
      </section>
    );
  }
}

export function App({ app }: { app: PanelApp }) {
  return (
    <Boundary>
      <Shell app={app} />
    </Boundary>
  );
}
