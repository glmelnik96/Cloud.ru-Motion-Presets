import { describe, it, expect, afterEach, vi } from 'vitest';
import { cdpCall } from '../../tools/lib/cdp.mjs';

// A stand-in for Node's global WebSocket: answers each CDP message by its id, after the socket "opens".
function fakeSocket(answer) {
  const sent = [];
  class FakeWS {
    constructor(url) { this.url = url; setTimeout(() => this.onopen && this.onopen(), 0); }
    send(text) {
      const msg = JSON.parse(text);
      sent.push(msg);
      setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify(answer(msg)) }), 0);
    }
    close() { setTimeout(() => this.onclose && this.onclose(), 0); }
  }
  return { FakeWS, sent };
}

describe('cdpCall', () => {
  const real = globalThis.WebSocket;
  afterEach(() => { globalThis.WebSocket = real; vi.useRealTimers(); });

  it('sends the methods in order, one id each, and returns their results', async () => {
    const { FakeWS, sent } = fakeSocket((m) => ({ id: m.id, result: { echo: m.method } }));
    globalThis.WebSocket = FakeWS;
    const r = await cdpCall('ws://x', [['Network.enable'], ['Network.clearBrowserCache'], ['Page.reload', { ignoreCache: true }]]);
    expect(sent.map((m) => [m.id, m.method, m.params])).toEqual([
      [1, 'Network.enable', {}], [2, 'Network.clearBrowserCache', {}], [3, 'Page.reload', { ignoreCache: true }],
    ]);
    expect(r).toEqual([{ echo: 'Network.enable' }, { echo: 'Network.clearBrowserCache' }, { echo: 'Page.reload' }]);
  });

  it('stops at the first protocol error', async () => {
    const { FakeWS, sent } = fakeSocket((m) => (m.method === 'Bad.method' ? { id: m.id, error: { code: -32601 } } : { id: m.id, result: {} }));
    globalThis.WebSocket = FakeWS;
    await expect(cdpCall('ws://x', [['Network.enable'], ['Bad.method'], ['Page.reload']])).rejects.toThrow(/CDP_ERROR: Bad.method/);
    expect(sent.map((m) => m.method)).toEqual(['Network.enable', 'Bad.method']);
  });

  it('times out when the page never answers', async () => {
    const { FakeWS } = fakeSocket(() => ({ id: -1 }));
    globalThis.WebSocket = FakeWS;
    await expect(cdpCall('ws://x', [['Page.reload']], { timeoutMs: 50 })).rejects.toThrow(/CDP_TIMEOUT/);
  });
});
