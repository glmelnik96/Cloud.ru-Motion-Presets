// getPageTarget goes on to the next port when one does not answer (tools/lib/cdp.mjs): after a restart of
// Premiere the background BrandKit Dev panel (8096) did not come up, the visible one (8097) did.
import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { getPageTarget } from '../../tools/lib/cdp.mjs';

function serve(targets) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(targets));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

describe('getPageTarget', () => {
  it('takes the first port with a page target', async () => {
    const empty = await serve([{ type: 'service_worker' }]);
    const panel = await serve([{ type: 'page', webSocketDebuggerUrl: 'ws://x' }]);
    const closed = await serve([]);
    const closedPort = closed.address().port;
    await new Promise((r) => closed.close(r));
    try {
      const page = await getPageTarget([closedPort, empty.address().port, panel.address().port]);
      expect(page.webSocketDebuggerUrl).toBe('ws://x');
      await expect(getPageTarget([closedPort, empty.address().port])).rejects.toThrow(/CDP_UNREACHABLE: port \d+: .*; port \d+: no page target/);
      expect((await getPageTarget(panel.address().port)).type).toBe('page');
    } finally {
      empty.close();
      panel.close();
    }
  });
});
