#!/usr/bin/env node
// Writes the panel's settings.json (%LOCALAPPDATA%\CloudRuBrandKit, plan P6) through a running host instead of from
// Node. On the dev machine a process started from the Claude desktop app gets AppData file virtualization: a NEW file
// it creates under %LOCALAPPDATA% goes to a private store that AE and Premiere never see (the panel read ENOENT for a
// settings.json Git Bash could list). The host's own ExtendScript File writes the real file. Keeps the other keys.
//   node tools/dev/panel-settings.mjs --host ae|pr [--library C:/CRBK/work/library]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../host-run.mjs';

export function settingsJsx(libraryRoot) {
  return `
var dir = new Folder($.getenv('LOCALAPPDATA') + '/CloudRuBrandKit');
if (!dir.exists) { dir.create(); }
var f = new File(dir.fsName + '/settings.json');
var doc = {};
if (f.exists) {
  f.encoding = 'UTF-8';
  if (f.open('r')) {
    try { doc = JSON.parse(f.read()) || {}; } catch (e) { doc = {}; }
    f.close();
  }
}
doc.libraryRoot = ${JSON.stringify(libraryRoot)};
f.encoding = 'UTF-8';
f.lineFeed = 'Unix';
var opened = f.open('w');
if (opened) { f.write(JSON.stringify(doc)); f.close(); }
JSON.stringify({ path: f.fsName, opened: opened, settings: doc });`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
  const host = arg('--host', 'ae');
  if (host !== 'ae' && host !== 'pr') throw new Error('--host ae|pr');
  const r = await run(host, settingsJsx(arg('--library', 'C:/CRBK/work/library')));
  console.log(JSON.stringify(r));
}
