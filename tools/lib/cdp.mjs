// Chrome DevTools Protocol: find the panel page and evaluate one expression in it.
// The page target of the BrandKit Dev panel on the first port that answers. Several ports: the background
// panel first, then the visible one — both run JSX in the same host (build PC, 2026-10-05: after a restart
// of Premiere the background panel on 8096 did not come up, the visible one on 8097 did).
export async function getPageTarget(ports) {
  const list = Array.isArray(ports) ? ports : [ports];
  const errors = [];
  for (const port of list) {
    let targets;
    try {
      const res = await fetch(`http://localhost:${port}/json`);
      targets = await res.json();
    } catch (e) {
      errors.push(`port ${port}: ${e.message}`);
      continue;
    }
    const page = targets.find((t) => t.type === 'page');
    if (page) return page;
    errors.push(`port ${port}: no page target`);
  }
  throw new Error(`CDP_UNREACHABLE: ${errors.join('; ')} — open the BrandKit Dev panel (Window > Extensions)`);
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
