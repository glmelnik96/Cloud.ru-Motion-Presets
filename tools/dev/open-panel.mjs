#!/usr/bin/env node
// Opens the BrandKit panel (ru.cloud.brandkit.panel) in a running host without touching the user's windows, then
// waits for its CDP port (8101 AE, 8102 Premiere; dev builds only).
// - CSInterface.requestOpenExtension opens an extension of another bundle only when it is called from a visible
//   panel: from the invisible dev extension (8094/8096) CEP 12 logs "requestOpenExtension: Unknown Exception".
//   So the call goes through the visible BrandKit Dev panel (8095 AE, 8097 Premiere) when it is open.
// - AE fallback: the panel's menu command, app.executeCommand(app.findMenuCommandId('Cloud.ru BrandKit')).
// - Premiere has no scripted menu command: open BrandKit Dev or the panel itself through Window > Extensions once;
//   Premiere keeps open panels in its workspace.
//   node tools/dev/open-panel.mjs --host ae|pr
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPageTarget, cdpEval } from '../lib/cdp.mjs';
import { run } from '../host-run.mjs';

export const PORTS = {
  ae: { harnessPanel: 8095, panel: 8101 },
  pr: { harnessPanel: 8097, panel: 8102 },
};
export const PANEL_ID = 'ru.cloud.brandkit.panel';
export const PANEL_MENU = 'Cloud.ru BrandKit';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reachable(port) {
  try {
    return await getPageTarget(port);
  } catch {
    return null;
  }
}

export async function waitForPanel(host, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const page = await reachable(PORTS[host].panel);
    if (page) return page;
    if (Date.now() > deadline) return null;
    await sleep(500);
  }
}

export async function openPanel(host) {
  const already = await reachable(PORTS[host].panel);
  if (already) return { page: already, how: 'already open' };
  const harness = await reachable(PORTS[host].harnessPanel);
  if (harness) {
    const r = await cdpEval(harness.webSocketDebuggerUrl,
      `(function(){ try { new CSInterface().requestOpenExtension('${PANEL_ID}', ''); return 'requested'; } catch (e) { return 'ERR ' + e; } })()`,
      { timeoutMs: 15000 });
    if (r === 'requested') {
      const page = await waitForPanel(host);
      if (page) return { page, how: 'requestOpenExtension from BrandKit Dev' };
    }
  }
  if (host === 'ae') {
    await run('ae', `var id = app.findMenuCommandId(${JSON.stringify(PANEL_MENU)}); if (id) { app.scheduleTask("app.executeCommand(" + id + ")", 200, false); } JSON.stringify({ id: id })`);
    const page = await waitForPanel(host);
    if (page) return { page, how: 'AE menu command' };
  }
  throw new Error(`the panel did not open in ${host}: open Window > Extensions > BrandKit Dev (or ${PANEL_MENU}) once; the host keeps it in its workspace`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const i = process.argv.indexOf('--host');
  const host = i > 0 ? process.argv[i + 1] : 'ae';
  if (!PORTS[host]) throw new Error('--host ae|pr');
  const { page, how } = await openPanel(host);
  console.log(`${host}: ${page.title} on ${PORTS[host].panel} (${how})`);
}
