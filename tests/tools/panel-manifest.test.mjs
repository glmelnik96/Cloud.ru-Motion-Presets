import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestInfo, readManifest, coversHosts, effectiveHosts } from '../../tools/panel/manifest-info.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// A CEP manifest: bundle hosts, and extensions that may carry their own HostList.
function manifest({ hosts, extensions }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ExtensionManifest ExtensionBundleId="ru.cloud.brandkit.trial" ExtensionBundleVersion="0.0.1" Version="11.0">',
    '  <ExtensionList>',
    ...extensions.map((e) => '    <Extension Id="' + e.id + '" Version="0.0.1" />'),
    '  </ExtensionList>',
    '  <ExecutionEnvironment>',
    '    <HostList>',
    ...hosts.map((h) => '      <Host Name="' + h + '" Version="[26.0,99.9]" />'),
    '    </HostList>',
    '    <RequiredRuntimeList><RequiredRuntime Name="CSXS" Version="11.0" /></RequiredRuntimeList>',
    '  </ExecutionEnvironment>',
    '  <DispatchInfoList>',
    ...extensions.map((e) => [
      '    <Extension Id="' + e.id + '">',
      e.own ? '      <HostList>' + e.own.map((h) => '<Host Name="' + h + '" Version="[26.0,99.9]" />').join('') + '</HostList>' : '',
      '      <DispatchInfo>',
      '        <Resources>',
      '          <MainPath>./' + e.id + '/index.html</MainPath>',
      '          <CEFCommandLine><Parameter>--enable-nodejs</Parameter><Parameter>--mixed-context</Parameter></CEFCommandLine>',
      '        </Resources>',
      '        <UI><Type>Panel</Type></UI>',
      '      </DispatchInfo>',
      '    </Extension>',
    ].join('\n')),
    '  </DispatchInfoList>',
    '</ExtensionManifest>',
  ].join('\n');
}

describe('manifestInfo', () => {
  it('reads the bundle, the runtime, the hosts and each extension', () => {
    const info = manifestInfo(manifest({ hosts: ['AEFT', 'PPRO'], extensions: [{ id: 'ru.cloud.brandkit.trial.main' }] }));
    expect(info).toMatchObject({ bundleId: 'ru.cloud.brandkit.trial', bundleVersion: '0.0.1', manifestVersion: '11.0', csxs: '11.0' });
    expect(info.hosts.map((h) => h.name)).toEqual(['AEFT', 'PPRO']);
    expect(info.extensions).toEqual([{
      id: 'ru.cloud.brandkit.trial.main',
      mainPath: './ru.cloud.brandkit.trial.main/index.html',
      scriptPath: null,
      type: 'Panel',
      hosts: null,
      parameters: ['--enable-nodejs', '--mixed-context'],
    }]);
  });
  it('one extension in both hosts covers AEFT and PPRO', () => {
    const info = manifestInfo(manifest({ hosts: ['AEFT', 'PPRO'], extensions: [{ id: 'a' }] }));
    expect(coversHosts(info, ['AEFT', 'PPRO'])).toEqual({ ok: true, missing: [] });
  });
  it('an extension limited by its own HostList does not', () => {
    const info = manifestInfo(manifest({ hosts: ['AEFT', 'PPRO'], extensions: [{ id: 'a', own: ['AEFT'] }, { id: 'b', own: ['PPRO'] }] }));
    expect(effectiveHosts(info, info.extensions[0])).toEqual(['AEFT']);
    expect(coversHosts(info, ['AEFT', 'PPRO'])).toEqual({ ok: false, missing: ['a: PPRO', 'b: AEFT'] });
  });
  it('ignores comments and rejects other XML', () => {
    const info = manifestInfo('<!-- <Host Name="ILST" Version="[0,99]" /> -->\n' + manifest({ hosts: ['AEFT'], extensions: [{ id: 'a' }] }));
    expect(info.hosts.map((h) => h.name)).toEqual(['AEFT']);
    expect(() => manifestInfo('<foo/>')).toThrow(/not a CEP manifest/);
  });
  it('reads the dev harness manifest of task 4', () => {
    const info = readManifest(path.join(REPO, 'dev/harness/CSXS/manifest.xml'));
    expect(info.bundleId).toBe('ru.cloud.brandkit.dev');
    expect(coversHosts(info, ['AEFT', 'PPRO']).ok).toBe(true);
  });
});
