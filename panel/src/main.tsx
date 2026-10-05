// Skeleton of the panel (task 1): proves the bundle, Preact and the host bridge run in CEP. The real UI
// (task 9) replaces this file's body.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

function hostInfo(): string {
  try {
    const env = JSON.parse(window.__adobe_cep__!.getHostEnvironment()) as { appName: string; appVersion: string };
    return env.appName + ' ' + env.appVersion;
  } catch (e) {
    return 'no CEP host (' + String(e instanceof Error ? e.message : e) + ')';
  }
}

function App() {
  const [hostVersion, setHostVersion] = useState('…');
  useEffect(() => {
    const cep = window.__adobe_cep__;
    if (!cep) return;
    cep.evalScript('String(app.version)', (r) => setHostVersion(r));
  }, []);
  const chrome = (navigator.userAgent.match(/Chrome\/[\d.]+/) || ['Chrome ?'])[0];
  return (
    <div id="crbk-skeleton" style={{ font: '13px sans-serif', color: '#ddd', padding: 12 }}>
      <b>Cloud.ru BrandKit {__CRBK_VERSION__}</b>
      <div>host: {hostInfo()}</div>
      <div>app.version: {hostVersion}</div>
      <div>{chrome}</div>
      <div>build: {__CRBK_BUILD__}</div>
    </div>
  );
}

document.body.style.background = '#232323';
render(<App />, document.getElementById('app')!);
