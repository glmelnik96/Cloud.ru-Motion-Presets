// Chrome DevTools Protocol: find the panel page and evaluate one expression in it.
export async function getPageTarget(port) {
  let targets;
  try {
    const res = await fetch(`http://localhost:${port}/json`);
    targets = await res.json();
  } catch (e) {
    throw new Error(`CDP_UNREACHABLE: port ${port} — open the BrandKit Dev panel (Window > Extensions) (${e.message})`);
  }
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error(`CDP_NO_PAGE: no page target on port ${port} (panel closed?)`);
  return page;
}

export function cdpEval(wsUrl, expression, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let outcome = null;
    const deliver = () => (outcome.err ? reject(outcome.err) : resolve(outcome.value));
    const finish = (err, value) => {
      if (outcome) return;
      outcome = { err, value };
      clearTimeout(timer);
      try { ws.close(); } catch { deliver(); }
    };
    const timer = setTimeout(() => finish(new Error(
      `CDP_TIMEOUT: ${timeoutMs} ms — a modal dialog may be blocking the host; check the host before any new call`)), timeoutMs);
    ws.onclose = () => {
      clearTimeout(timer);
      if (!outcome) outcome = { err: new Error('CDP_CLOSED: socket closed before the reply') };
      deliver();
    };
    ws.onerror = (e) => finish(new Error('CDP_WS_ERROR: ' + ((e && e.message) || e)));
    ws.onopen = () => ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
    ws.onmessage = (msg) => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      if (data.id !== 1) return;
      if (data.error) { finish(new Error('CDP_ERROR: ' + JSON.stringify(data.error))); return; }
      const r = data.result || {};
      if (r.exceptionDetails) {
        const ex = r.exceptionDetails;
        finish(new Error('CDP_EXCEPTION: ' + ((ex.exception && ex.exception.description) || ex.text)));
        return;
      }
      finish(null, r.result ? r.result.value : undefined);
    };
  });
}

// Several protocol methods in order on one socket, each with its own id: [[method, params?], ...] -> their results.
// Stops at the first protocol error. The dev tools use it to hard-reload a panel: CEF serves a rebuilt panel's old
// index.html from its cache, so Network.clearBrowserCache comes before Page.reload with ignoreCache.
export function cdpCall(wsUrl, calls, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const results = [];
    let next = 0;
    let outcome = null;
    const finish = (err, value) => {
      if (outcome) return;
      outcome = { err, value };
      clearTimeout(timer);
      try { ws.close(); } catch { /* the outcome stands */ }
      if (err) reject(err); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`CDP_TIMEOUT: ${timeoutMs} ms waiting for ${calls[next] ? calls[next][0] : 'the page'}`)), timeoutMs);
    const send = () => {
      if (next >= calls.length) { finish(null, results); return; }
      const [method, params = {}] = calls[next];
      ws.send(JSON.stringify({ id: next + 1, method, params }));
    };
    ws.onopen = send;
    ws.onerror = (e) => finish(new Error('CDP_WS_ERROR: ' + ((e && e.message) || e)));
    ws.onclose = () => finish(new Error('CDP_CLOSED: socket closed before the replies'));
    ws.onmessage = (msg) => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      if (data.id !== next + 1) return;
      if (data.error) { finish(new Error(`CDP_ERROR: ${calls[next][0]} ${JSON.stringify(data.error)}`)); return; }
      results.push(data.result);
      next += 1;
      send();
    };
  });
}

// Reloads the page on `port` with the cache cleared, then waits until `ready` (an expression) is true in it.
export async function hardReload(port, { ready = 'document.readyState === "complete"', timeoutMs = 30000 } = {}) {
  const page = await getPageTarget(port);
  await cdpCall(page.webSocketDebuggerUrl, [['Network.enable'], ['Network.clearBrowserCache'], ['Page.reload', { ignoreCache: true }]]);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const p = await getPageTarget(port);
      if (await cdpEval(p.webSocketDebuggerUrl, `Boolean(${ready})`, { timeoutMs: 5000 })) return p;
    } catch { /* the page is still loading */ }
    if (Date.now() > deadline) throw new Error(`CDP_TIMEOUT: the page on ${port} was not ready ${timeoutMs} ms after the reload`);
  }
}
