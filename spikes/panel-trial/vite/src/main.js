// Own-Vite trial panel (task 29): Preact renders in CEP and shows which host and Chromium loaded it.
import { h, render } from 'preact';

function hostInfo() {
  try {
    const env = JSON.parse(window.__adobe_cep__.getHostEnvironment());
    return env.appName + ' ' + env.appVersion;
  } catch (e) {
    return 'no CEP host (' + String(e && e.message) + ')';
  }
}

const chrome = (navigator.userAgent.match(/Chrome\/[\d.]+/) || ['Chrome ?'])[0];

render(
  h('div', { style: 'font: 13px sans-serif; color: #ddd; padding: 8px' },
    h('b', null, 'BrandKit Trial Vite'),
    h('div', null, 'host: ' + hostInfo()),
    h('div', null, chrome)),
  document.getElementById('app'),
);
