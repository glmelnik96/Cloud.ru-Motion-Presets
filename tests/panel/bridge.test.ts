import { describe, expect, it } from 'vitest';
import { asciiEscape, Bridge, COLD, evalFileScript, hostScript, parseReply, STALE, type BridgeEvent } from '../../panel/src/bridge/bridge';

// A host that evaluates BK.call(fn, json) with a JS handler; `cold` first replies are "EvalScript error.".
function fakeHost(handlers: Record<string, (args: unknown) => unknown>, { cold = 0, delayMs = 0, hang = new Set<string>() } = {}) {
  const seen: string[] = [];
  let left = cold;
  let loads = 0;
  const evalScript = (script: string) =>
    new Promise<string>((resolve) => {
      seen.push(script);
      const m = /^BK\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)$/.exec(script);
      if (!m) throw new Error('unexpected script ' + script);
      const fn = JSON.parse(m[1]) as string;
      const args = JSON.parse(JSON.parse(m[2]) as string);
      if (left > 0) {
        left -= 1;
        resolve('EvalScript error.');
        return;
      }
      if (hang.has(fn)) return;
      setTimeout(() => {
        try {
          resolve(JSON.stringify({ ok: true, data: handlers[fn](args) }));
        } catch (e) {
          resolve(JSON.stringify({ ok: false, error: { code: 'HOST_EXCEPTION', message: String(e) } }));
        }
      }, delayMs);
    });
  return { evalScript, seen, loadHost: async () => void (loads += 1), loads: () => loads };
}

const noSleep = async () => undefined;

describe('bridge', () => {
  it('sends arguments as ASCII and gets Cyrillic back intact', async () => {
    const h = fakeHost({ echo: (a) => a });
    const b = new Bridge({ evalScript: h.evalScript });
    const r = await b.call('echo', { name: 'Анна-Мария Ёлкина', quote: 'a"b\\c', nl: 'x\ny' });
    expect(r).toEqual({ ok: true, data: { name: 'Анна-Мария Ёлкина', quote: 'a"b\\c', nl: 'x\ny' } });
    expect(/^[\x20-\x7e]*$/.test(h.seen[0])).toBe(true);
  });

  it('builds the script ExtendScript parses', () => {
    expect(hostScript('ping', { a: 'я' })).toBe('BK.call("ping","{\\"a\\":\\"\\u044f\\"}")');
    expect(asciiEscape('\u2028')).toBe('\\u2028');
    expect(evalFileScript('C:\\Users\\Глеб\\host\\brandkit.jsx')).toBe("$.evalFile(\"C:/Users/\\u0413\\u043b\\u0435\\u0431/host/brandkit.jsx\");'loaded'");
  });

  it('guards a call with the version of the bundle when it has one', () => {
    expect(hostScript('ping', null, '0.1.20')).toBe(
      `((typeof BK!=='undefined'&&BK&&typeof BK.call==='function'&&BK.version==="0.1.20")?BK.call("ping","null"):'BK_STALE '+((typeof BK!=='undefined'&&BK&&typeof BK.call==='function')?String(BK.version):'none'))`);
    expect(parseReply('BK_STALE 0.1.4')).toBe(STALE);
    expect(parseReply('BK_STALE none')).toBe(STALE);
  });

  it('reads replies, cold starts and garbage', () => {
    expect(parseReply('EvalScript error.')).toBe(COLD);
    expect(parseReply('')).toBe(COLD);
    expect(parseReply(undefined)).toBe(COLD);
    expect(parseReply('{"ok":true,"data":1}')).toEqual({ ok: true, data: 1 });
    expect(parseReply('<html>')).toMatchObject({ ok: false, error: { code: 'BRIDGE' } });
    expect(parseReply('{"data":1}')).toMatchObject({ ok: false, error: { code: 'BRIDGE' } });
  });

  it('runs calls one after another', async () => {
    const order: string[] = [];
    const h = fakeHost({ a: () => order.push('a'), b: () => order.push('b') }, { delayMs: 5 });
    const b = new Bridge({ evalScript: h.evalScript });
    await Promise.all([b.call('a'), b.call('b'), b.call('a')]);
    expect(order).toEqual(['a', 'b', 'a']);
  });

  it('loads the host and repeats a read call on a cold start', async () => {
    const h = fakeHost({ ping: () => 'pong' }, { cold: 2 });
    const events: BridgeEvent[] = [];
    const b = new Bridge({ evalScript: h.evalScript, loadHost: h.loadHost, sleep: noSleep, onCall: (e) => events.push(e) });
    expect(await b.call('ping')).toEqual({ ok: true, data: 'pong' });
    expect(h.loads()).toBe(2);
    expect(events.map((e) => [e.attempt, e.code ?? 'ok'])).toEqual([[0, 'HOST_NOT_READY'], [1, 'HOST_NOT_READY'], [2, 'ok']]);
  });

  it('never repeats a call that changes the project', async () => {
    let inserts = 0;
    const h = fakeHost({ insertItem: () => (inserts += 1) }, { cold: 1 });
    const b = new Bridge({ evalScript: h.evalScript, loadHost: h.loadHost, sleep: noSleep });
    const r = await b.call('insertItem', {}, { mutating: true });
    expect(r).toMatchObject({ ok: false, error: { code: 'HOST_NOT_READY' } });
    expect(inserts).toBe(0);
    expect(h.seen.length).toBe(1);
  });

  it('gives up a read call after the cold retries', async () => {
    const h = fakeHost({ ping: () => 'pong' }, { cold: 5 });
    const b = new Bridge({ evalScript: h.evalScript, loadHost: h.loadHost, sleep: noSleep, coldRetries: 1 });
    expect(await b.call('ping')).toMatchObject({ ok: false, error: { code: 'HOST_NOT_READY' } });
    expect(h.seen.length).toBe(2);
  });

  it('times out and goes on with the next call', async () => {
    const h = fakeHost({ slow: () => 1, ping: () => 'pong' }, { hang: new Set(['slow']) });
    const b = new Bridge({ evalScript: h.evalScript, timeoutMs: 20 });
    const [slow, ping] = await Promise.all([b.call('slow', null, { mutating: true }), b.call('ping')]);
    expect(slow).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(ping).toEqual({ ok: true, data: 'pong' });
    expect(h.seen.filter((s) => s.includes('slow')).length).toBe(1);
  });

  it('passes host errors through', async () => {
    const h = fakeHost({ boom: () => { throw new Error('no comp'); } });
    expect(await new Bridge({ evalScript: h.evalScript }).call('boom')).toMatchObject({ ok: false, error: { code: 'HOST_EXCEPTION', message: 'Error: no comp' } });
  });
});
