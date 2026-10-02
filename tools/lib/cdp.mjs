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
