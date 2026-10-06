// Drive the After Effects half of the export research.
//   node spikes/export-research/ae-run.mjs list
//   node spikes/export-research/ae-run.mjs render
//   node spikes/export-research/ae-run.mjs save-template <baseName>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { composeProbe } from '../../tools/spike/runner.mjs';
import { run } from '../../tools/host-run.mjs';
import { workPath } from '../../tools/lib/work.mjs';
import { probeExport } from './media.mjs';

const ROOT = workPath('export-research');
const PROJECT = path.posix.join(ROOT, 'ae', 'probe.aep');
const OUT = path.posix.join(ROOT, 'ae', 'out');
const TONE = path.posix.join(ROOT, 'media', 'tone-2s.wav');
const REPO_EXPORT = path.resolve('docs/research/export');

function safe(name) {
  return String(name).replace(/[^\w.-]+/g, '_').replace(/^_|_$/g, '');
}

async function host(params, timeoutMs) {
  const jsx = composeProbe(['spikes/lib/ae-project.jsx', 'spikes/export-research/ae-probe.jsx'], Object.assign({
    workDir: 'C:/CRBK/work',
    project: PROJECT,
    comp: 'Probe2s',
    width: 1920,
    height: 1080,
    fps: 25,
    seconds: 2,
    tone: TONE,
  }, params));
  return run('ae', jsx, { timeoutMs });
}

async function list() {
  const r = await host({ op: 'list' }, 180000);
  const data = r.data || {};
  mkdirSync(REPO_EXPORT, { recursive: true });
  const doc = {
    version: data.version,
    project: PROJECT,
    comp: data.comp,
    templateCount: data.templateCount,
    initialFormat: data.initial && data.initial.Format,
    initialSettable: data.initialSettable,
    rqSettable: data.rqSettable,
    rqSettings: data.rqSettings,
    templates: data.templates,
    h264: data.h264,
    resizeBase: data.resizeBase,
    resizeTries: data.resizeTries,
    fpsTries: data.fpsTries,
    checks: r.checks,
  };
  writeFileSync(path.join(REPO_EXPORT, 'ae-om.json'), JSON.stringify(doc, null, 2) + '\n');
  console.log('templates ' + data.templateCount + ', h264 ' + ((data.h264 && data.h264.length) || 0));
  for (const t of data.templates || []) console.log(' - ' + t.format + ' | ' + t.name + (t.error ? ' ERR ' + t.error : ''));
  console.log('resize ' + JSON.stringify(data.resizeTries));
  console.log('fps ' + JSON.stringify(data.fpsTries));
  return doc;
}

async function renderAll() {
  const om = JSON.parse(readFileSync(path.join(REPO_EXPORT, 'ae-om.json'), 'utf8'));
  const renders = [];
  for (const t of om.h264 || []) {
    const out = path.posix.join(OUT, safe(t.name) + '.mp4');
    let error = null;
    let hostResult = null;
    const t0 = Date.now();
    try {
      hostResult = await host({ op: 'render', template: t.name, out, outDir: OUT }, 240000);
    } catch (e) {
      error = String(e.message || e);
    }
    let probed = null;
    if (!error && existsSync(out)) {
      try { probed = probeExport(out); } catch (e2) { error = 'ffprobe: ' + e2.message; }
    }
    const row = {
      template: t.name,
      format: t.format,
      settings: t.settings,
      settable: t.settable,
      out,
      hostMs: hostResult && hostResult.data && hostResult.data.render ? hostResult.data.render.ms : null,
      applied: hostResult && hostResult.data ? hostResult.data.render : null,
      wallMs: Date.now() - t0,
      error,
      probed,
    };
    renders.push(row);
    console.log(t.name + ' ' + (error || ('ok ' + row.hostMs + 'ms')));
    om.renders = renders;
    writeFileSync(path.join(REPO_EXPORT, 'ae-om.json'), JSON.stringify(om, null, 2) + '\n');
  }
  return renders;
}

async function approach(template) {
  const r = await host({ op: 'approach', template }, 120000);
  const data = r.data || {};
  const om = JSON.parse(readFileSync(path.join(REPO_EXPORT, 'ae-om.json'), 'utf8'));
  om.approach = { template, tries: data.approach, omNow: data.omNow, rqNow: data.rqNow };
  writeFileSync(path.join(REPO_EXPORT, 'ae-om.json'), JSON.stringify(om, null, 2) + '\n');
  console.log(JSON.stringify(data.approach, null, 2));
  console.log('Resize to now: ' + (data.omNow && data.omNow['Resize to']));
  console.log('Frame Rate now: ' + (data.rqNow && data.rqNow['Frame Rate']) + ' / ' + (data.rqNow && data.rqNow['Use this frame rate']));
}

async function extra() {
  const footage = path.posix.join(ROOT, 'media', 'busy-2s.mp4');
  if (!existsSync(footage)) {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('C:/ffmpeg/bin/ffmpeg.exe', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '10', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', footage], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr.slice(-400));
  }
  const made = await host({ op: 'ensure', comp: 'ProbeBusy', footage, width: 1920, height: 1080, fps: 25, seconds: 2 }, 60000);
  if (!made.checks || !made.checks[0] || !made.checks[0].pass) {
    throw new Error('busy comp was not created: ' + JSON.stringify(made.checks));
  }
  console.log('busy comp ' + JSON.stringify(made.data && made.data.comp));
  const jobs = [
    ['H.264 - Match Render Settings -  5 Mbps', 'ProbeBusy', 'busy-5.mp4', null, null],
    ['H.264 - Match Render Settings - 15 Mbps', 'ProbeBusy', 'busy-15.mp4', null, null],
    ['H.264 - Match Render Settings - 40 Mbps', 'ProbeBusy', 'busy-40.mp4', null, null],
    ['H.264 - Match Render Settings - 15 Mbps', 'Probe2s', 'resize-1920.mp4', '1920,1080', null],
    ['H.264 - Match Render Settings - 15 Mbps', 'Probe2s', 'resize-1080x1920.mp4', '1080,1920', null],
    ['H.264 - Match Render Settings - 15 Mbps', 'Probe2s', 'fps-30.mp4', null, '30'],
    ['H.264 - Match Render Settings - 15 Mbps', 'Probe2s', 'resize-9x16-30.mp4', '1080,1920', '30'],
    ['H.264 - Match Render Settings - 40 Mbps', 'Probe2s', 'resize-fullhd-25.mp4', '1920,1080', '25'],
  ];
  const experiments = [];
  for (const [template, comp, file, resizeTo, useFrameRate] of jobs) {
    const out = path.posix.join(OUT, file);
    let error = null;
    let hostResult = null;
    try {
      hostResult = await host({ op: 'render', template, comp, out, outDir: OUT, resizeTo, useFrameRate }, 180000);
    } catch (e) {
      error = String(e.message || e);
    }
    let probed = null;
    if (!error && existsSync(out)) {
      try { probed = probeExport(out); } catch (e2) { error = e2.message; }
    }
    const applied = hostResult && hostResult.data && hostResult.data.render;
    const v = probed && probed.video;
    const line = error || !v
      ? (error || 'no video')
      : (v.width + 'x' + v.height + ' ' + v.fps + 'fps ' + v.profile + ' L' + v.level + ' v' + v.bitrate + ' fmt' + probed.formatBitrate + ' ' + (applied && applied.resizeTo) + ' rq ' + (applied && applied.frameRate));
    console.log(file + ' ' + line);
    experiments.push({ file, template, comp, resizeTo, useFrameRate, error, applied, probed });
  }
  const om = JSON.parse(readFileSync(path.join(REPO_EXPORT, 'ae-om.json'), 'utf8'));
  om.experiments = experiments;
  writeFileSync(path.join(REPO_EXPORT, 'ae-om.json'), JSON.stringify(om, null, 2) + '\n');
}

async function named() {
  const listed = await host({ op: 'has', templateName: 'CR FullHD' }, 60000);
  console.log('listed ' + JSON.stringify(listed.data && listed.data.listed));
  const out = path.posix.join(OUT, 'cr-fullhd-busy.mp4');
  const t0 = Date.now();
  const rendered = await host({
    op: 'render',
    template: 'CR FullHD',
    comp: 'ProbeBusy',
    out,
    outDir: OUT,
    savePrefs: true,
  }, 180000);
  let probed = null;
  let error = null;
  if (existsSync(out)) {
    try { probed = probeExport(out); } catch (e) { error = e.message; }
  } else error = 'no file';
  const doc = {
    template: 'CR FullHD',
    aom: 'docs/research/export/CR-FullHD.aom',
    listed: !!(listed.data && listed.data.listed),
    names: listed.data && listed.data.names,
    applied: rendered.data && rendered.data.render,
    appliedSettings: rendered.data && rendered.data.appliedSettings,
    prefs: rendered.data && rendered.data.prefs,
    wallMs: Date.now() - t0,
    error,
    probed,
    builtByHand: {
      base: 'H.264 - Match Render Settings - 15 Mbps',
      performance: 'Software Encoding',
      profile: 'High',
      level: '4.2',
      bitrate: 'VBR, 1 pass, target 10 Mbps, max 20 Mbps',
      audio: 'AAC 320 kbps, 48 kHz, stereo',
      resize: false,
      note: 'The H.264 Options summary still said 320x240 30 fps. Resize was left off, so the render is expected to follow the comp (1920x1080 25).',
    },
  };
  mkdirSync(REPO_EXPORT, { recursive: true });
  writeFileSync(path.join(REPO_EXPORT, 'ae-aom.json'), JSON.stringify(doc, null, 2) + '\n');
  const v = probed && probed.video;
  console.log(error || (v && (v.width + 'x' + v.height + ' ' + v.fps + 'fps ' + v.profile + ' L' + v.level + ' v' + v.bitrate + ' a' + (probed.audio && probed.audio.bitrate))));
  return doc;
}

async function saveTemplate(base) {
  const r = await host({
    op: 'saveTemplate',
    baseTemplate: base,
    templateName: 'CR FullHD',
  }, 120000);
  console.log(JSON.stringify(r.data || r, null, 2));
  return r;
}

async function time10() {
  const footage = path.posix.join(ROOT, 'media', 'src-10s.mp4');
  if (!existsSync(footage)) throw new Error('missing ' + footage);
  const made = await host({
    op: 'ensure', comp: 'Probe10', footage, width: 1920, height: 1080, fps: 25, seconds: 10,
  }, 60000);
  if (!made.checks || !made.checks[0] || !made.checks[0].pass) {
    throw new Error('Probe10 was not created: ' + JSON.stringify(made.checks));
  }
  const out = path.posix.join(OUT, 'cr-fullhd-10s.mp4');
  const t0 = Date.now();
  const rendered = await host({
    op: 'render', template: 'CR FullHD', comp: 'Probe10', out, outDir: OUT,
  }, 300000);
  const row = {
    method: 'ae-render-queue',
    out,
    hostMs: rendered.data && rendered.data.render ? rendered.data.render.ms : null,
    wallMs: Date.now() - t0,
    bytes: rendered.data && rendered.data.render ? rendered.data.render.bytes : null,
    probed: existsSync(out) ? probeExport(out) : null,
  };
  console.log(JSON.stringify(row));
  return row;
}

const cmd = process.argv[2];
if (cmd === 'list') await list();
else if (cmd === 'approach') await approach(process.argv[3] || 'H.264 - Match Render Settings - 15 Mbps');
else if (cmd === 'render') await renderAll();
else if (cmd === 'extra') await extra();
else if (cmd === 'save-template') await saveTemplate(process.argv[3]);
else if (cmd === 'named') await named();
else if (cmd === 'time10') await time10();
else {
  console.error('usage: ae-run.mjs list|render|extra|named|save-template <base>');
  process.exit(2);
}
