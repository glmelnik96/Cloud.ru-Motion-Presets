// Own-Vite trial panel (task 29): shows which host and Chromium loaded it. Plain DOM: the npm downloads of
// the trial (preact, vite@latest) were not allowed, so it builds with the vite the repo already has (the
// vitest dependency) and no UI library; Preact (N2) is checked when the real panel is built.
function hostInfo() {
  try {
    const env = JSON.parse(window.__adobe_cep__.getHostEnvironment());
    return env.appName + ' ' + env.appVersion;
  } catch (e) {
    return 'no CEP host (' + String(e && e.message) + ')';
  }
}

const chrome = (navigator.userAgent.match(/Chrome\/[\d.]+/) || ['Chrome ?'])[0];
const app = document.getElementById('app');
app.style.cssText = 'font: 13px sans-serif; color: #ddd; padding: 8px';
for (const [tag, text] of [['b', 'BrandKit Trial Vite'], ['div', 'host: ' + hostInfo()], ['div', chrome]]) {
  const el = document.createElement(tag);
  el.textContent = text;
  el.style.display = 'block';
  app.appendChild(el);
}
