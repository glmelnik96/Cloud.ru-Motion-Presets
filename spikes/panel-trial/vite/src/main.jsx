// Own-Vite trial panel (task 29): shows which host and Chromium loaded it. Preact 10 with hooks (N2),
// JSX compiled by Vite's esbuild (automatic runtime, jsxImportSource preact); no other UI library.
import { render } from 'preact';
import { useState } from 'preact/hooks';

function hostInfo() {
  try {
    const env = JSON.parse(window.__adobe_cep__.getHostEnvironment());
    return env.appName + ' ' + env.appVersion;
  } catch (e) {
    return 'no CEP host (' + String(e && e.message) + ')';
  }
}

const chrome = (navigator.userAgent.match(/Chrome\/[\d.]+/) || ['Chrome ?'])[0];

function Panel() {
  const [clicks, setClicks] = useState(0);
  return (
    <div style={{ font: '13px sans-serif', color: '#ddd', padding: 8 }}>
      <b>BrandKit Trial Vite</b>
      <div>host: {hostInfo()}</div>
      <div>{chrome}</div>
      <button type="button" onClick={() => setClicks(clicks + 1)}>Preact: {clicks}</button>
    </div>
  );
}

render(<Panel />, document.getElementById('app'));
