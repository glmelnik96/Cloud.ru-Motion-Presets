import { describe, it, expect } from 'vitest';
import { createCep, envVar, fileUrlToPath, systemInfo } from '../../../panel/src/services/cep';
import { createFiles, posixPath } from '../../../panel/src/services/files';

// The panel tsconfig has no Node types (types: []); the tests run in Node, so the built-ins come in untyped.
const nodeModule = 'node:module';
const { createRequire } = (await import(nodeModule)) as { createRequire(url: string): (id: string) => any };
const req = createRequire(import.meta.url);

const WIN_URL = 'file:///C:/Users/%D0%93%D0%BB%D0%B5%D0%B1/AppData/Roaming/Adobe/CEP/extensions/ru.cloud.brandkit';

function runtime(over: Partial<CepRuntime> = {}): CepRuntime {
  return {
    evalScript: (script, cb) => cb?.('echo:' + script),
    getHostEnvironment: () => JSON.stringify({ appName: 'PPRO', appVersion: '26.5.2', appLocale: 'en_US' }),
    getSystemPath: (type) => (type === 'extension' ? WIN_URL : 'file:///C:/other'),
    requestOpenExtension: () => undefined,
    ...over,
  };
}

const evalOnce = (cep: ReturnType<typeof createCep>, script: string) =>
  new Promise<string>((resolve) => cep.evalScript(script, resolve));

describe('cep', () => {
  it('refuses to start outside a CEP host', () => {
    expect(() => createCep({})).toThrow(/__adobe_cep__/);
  });

  it('reads the host application from the host environment', () => {
    const pr = createCep({ __adobe_cep__: runtime() });
    expect(pr.hostEnv()).toEqual({ appName: 'PPRO', appVersion: '26.5.2' });
    expect(pr.host()).toBe('pr');
    const ae = createCep({ __adobe_cep__: runtime({ getHostEnvironment: () => JSON.stringify({ appName: 'AEFT', appVersion: '26.5.0' }) }) });
    expect(ae.hostEnv()).toEqual({ appName: 'AEFT', appVersion: '26.5.0' });
    expect(ae.host()).toBe('ae');
  });

  it('rejects other host applications and a broken host environment', () => {
    const ilst = createCep({ __adobe_cep__: runtime({ getHostEnvironment: () => JSON.stringify({ appName: 'ILST', appVersion: '30.0' }) }) });
    expect(() => ilst.host()).toThrow(/ILST/);
    const broken = createCep({ __adobe_cep__: runtime({ getHostEnvironment: () => 'not json' }) });
    expect(() => broken.hostEnv()).toThrow(/host environment/);
  });

  it('passes scripts to the host and returns the reply', async () => {
    const seen: string[] = [];
    const cep = createCep({ __adobe_cep__: runtime({ evalScript: (s, cb) => { seen.push(s); cb?.('{"ok":true}'); } }) });
    expect(await evalOnce(cep, 'CRBK.call("ping", "{}")')).toBe('{"ok":true}');
    expect(seen).toEqual(['CRBK.call("ping", "{}")']);
  });

  // The bridge answers a throw with HOST_BRIDGE_ERROR and keeps the message (tests/panel/bridge/host.test.ts,
  // 'keeps going after evalScript throws'); a bare 'EvalScript error.' would lose it.
  it('passes a throw of the runtime to the caller with its reason and never answers after it', async () => {
    const cep = createCep({ __adobe_cep__: runtime({ evalScript: () => { throw new Error('engine gone'); } }) });
    const got: string[] = [];
    expect(() => cep.evalScript('1', (r) => got.push(r))).toThrow('engine gone');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(got).toEqual([]);
  });

  it('answers once when the runtime calls back twice', async () => {
    const cep = createCep({ __adobe_cep__: runtime({ evalScript: (_s, cb) => { cb?.('first'); cb?.('second'); } }) });
    const got: string[] = [];
    cep.evalScript('1', (r) => got.push(r));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(got).toEqual(['first']);
  });

  it('does not answer twice when the callback itself throws', async () => {
    const cep = createCep({ __adobe_cep__: runtime({ evalScript: (_s, cb) => cb?.('reply') }) });
    const got: string[] = [];
    const bad = (r: string): void => {
      got.push(r);
      throw new Error('bug in the caller');
    };
    expect(() => cep.evalScript('1', bad)).toThrow('bug in the caller');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(got).toEqual(['reply']);
  });

  it('turns the extension URL into a path with forward slashes', () => {
    expect(createCep({ __adobe_cep__: runtime() }).extensionPath()).toBe('C:/Users/Глеб/AppData/Roaming/Adobe/CEP/extensions/ru.cloud.brandkit');
    expect(fileUrlToPath('file:///Users/gleb/Library/Application%20Support/Adobe/CEP/extensions/ru.cloud.brandkit/'))
      .toBe('/Users/gleb/Library/Application Support/Adobe/CEP/extensions/ru.cloud.brandkit');
    expect(fileUrlToPath('file:///C:/Users/Глеб/a%23b')).toBe('C:/Users/Глеб/a#b');
    expect(fileUrlToPath('file://server/share/ext')).toBe('//server/share/ext');
    expect(fileUrlToPath('file:///C:/100%/ext')).toBe('C:/100%/ext'); // a lone % is not an escape
    expect(fileUrlToPath('C:\\plain\\path')).toBe('C:/plain/path');
  });

  it('finds Node through cep_node first, then window.require', () => {
    const fromCepNode = createCep({ __adobe_cep__: runtime(), cep_node: { require: (id) => 'cep_node:' + id }, require: (id) => 'window:' + id });
    expect(fromCepNode.nodeRequire()('fs')).toBe('cep_node:fs');
    const fromWindow = createCep({ __adobe_cep__: runtime(), require: (id) => 'window:' + id });
    expect(fromWindow.nodeRequire()('fs')).toBe('window:fs');
  });

  it('says Node is off when the panel has no require', () => {
    expect(() => createCep({ __adobe_cep__: runtime() }).nodeRequire()).toThrow(/enable-nodejs/);
  });

  it('collects the environment, platform and home folder through Node', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' };
    const fake = (id: string): unknown => {
      if (id === 'process') return { env, platform: 'win32' };
      if (id === 'os') return { homedir: () => 'C:\\Users\\u' };
      throw new Error('unexpected ' + id);
    };
    expect(systemInfo(fake)).toEqual({ env, platform: 'win32', home: 'C:/Users/u' });
  });

  it('hands the real Node modules to the other services, as main.tsx will', async () => {
    const cep = createCep({ __adobe_cep__: runtime(), cep_node: { require: req } });
    const sys = systemInfo(cep.nodeRequire());
    expect(sys.platform).toBe(req('process').platform);
    expect(sys.env).toBe(req('process').env);
    expect(sys.home).toBe(posixPath(req('os').homedir()));
    const files = createFiles(cep.nodeRequire());
    const self = fileUrlToPath(import.meta.url); // the repo path has Cyrillic and spaces
    expect(self.endsWith('/tests/panel/services/cep.test.ts')).toBe(true);
    expect(self).not.toMatch(/^file:|%/);
    expect(await files.exists(self)).toBe(true);
  });

  it('reads Windows variables in any letter case', () => {
    expect(envVar({ windir: 'C:\\Windows' }, 'WINDIR')).toBe('C:\\Windows');
    expect(envVar({ LOCALAPPDATA: 'X' }, 'LocalAppData')).toBe('X');
    expect(envVar({ LOCALAPPDATA: '' }, 'LOCALAPPDATA')).toBeUndefined();
    expect(envVar({}, 'HOME')).toBeUndefined();
  });
});
