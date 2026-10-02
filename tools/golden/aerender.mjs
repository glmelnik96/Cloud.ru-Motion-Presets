// aerender out of process (never renderQueue.render() over the bridge, ae-quirks #33) under a
// watchdog (ae-quirks #182, #184): progress = a NEW frame number; a render whose files are complete
// is accepted even if the process hangs in finalisation; success is judged by ffprobe, not exit code.
import { createWriteStream } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

export function aerenderPath(env = process.env, platform = process.platform) {
  if (env.BRANDKIT_AERENDER) return env.BRANDKIT_AERENDER;
  return platform === 'win32'
    ? 'C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/aerender.exe'
    : '/Applications/Adobe After Effects 2026/aerender';
}

export function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  else { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
}

// Last "PROGRESS:  0:00:01:05 (31): 0 Seconds" frame in a chunk of aerender output.
export function lastProgress(text) {
  let m;
  let last = null;
  const re = /PROGRESS:\s+([\d:;.]+)\s+\((\d+)\)/g;
  while ((m = re.exec(text))) last = m[1] + '#' + m[2];
  return last;
}

export function runWatched({ exe, args, logFile, isDone = async () => false, stallMs = 600000, maxMs = 6 * 3600000, pollMs = 30000, graceMs = 60000 }) {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { windowsHide: true });
    const log = createWriteStream(logFile, { flags: 'a' });
    let lastKey = null;
    let lastChange = Date.now();
    let doneSince = null;
    let reason = null;
    const start = Date.now();
    const onData = (buf) => {
      const text = buf.toString('utf8');
      log.write(text);
      const k = lastProgress(text);
      if (k && k !== lastKey) { lastKey = k; lastChange = Date.now(); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const stop = (why) => { reason = why; clearInterval(timer); killTree(child.pid); };
    const timer = setInterval(async () => {
      if (await isDone()) {
        doneSince = doneSince || Date.now();
        if (Date.now() - doneSince > graceMs) stop('done-but-hanging');
      } else if (Date.now() - lastChange > stallMs) stop('stall');
      else if (Date.now() - start > maxMs) stop('timeout');
    }, pollMs);
    child.on('error', (e) => { reason = 'spawn: ' + e.message; });
    child.on('close', (code) => {
      clearInterval(timer);
      log.end();
      resolve({ code, reason, ms: Date.now() - start });
    });
  });
}

// { width, height, duration } of the first video stream, or null if ffprobe cannot read the file yet.
export function ffprobeVideo(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration',
    '-of', 'json', file], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    const s = j.streams && j.streams[0];
    if (!s || !j.format) return null;
    return { width: s.width, height: s.height, duration: Number(j.format.duration) };
  } catch {
    return null;
  }
}

// A preview is good when it is half the comp size (H.264 rounds odd sizes down to even) and lasts
// comp.duration within two frames. For a comp longer than a minute render.mjs passes its span (60 s).
export function previewOk(info, comp) {
  if (!info) return false;
  const even = (n) => 2 * Math.floor(n / 4);
  const wOk = Math.abs(info.width - comp.width / 2) <= 1 || info.width === even(comp.width);
  const hOk = Math.abs(info.height - comp.height / 2) <= 1 || info.height === even(comp.height);
  return wOk && hOk && Math.abs(info.duration - comp.duration) <= 2 / comp.fps;
}
