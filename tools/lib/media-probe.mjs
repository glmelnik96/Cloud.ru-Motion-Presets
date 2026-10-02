// ffprobe wrapper: one JSON call per file, summarised to the fields the spikes compare.
import { spawnSync } from 'node:child_process';

export function hasBinary(bin) {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}

export function ffprobeJson(file, bin = 'ffprobe') {
  const r = spawnSync(bin, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('ffprobe failed for ' + file + ': ' + String(r.stderr || r.error || '').trim());
  return JSON.parse(r.stdout);
}

const num = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function frameRate(s) {
  if (!s || s === '0/0') return null;
  const [n, d] = String(s).split('/').map(Number);
  if (!Number.isFinite(n)) return null;
  return d ? Math.round((n / d) * 1000) / 1000 : n;
}

export function summarize(j) {
  const streams = (j && j.streams) || [];
  const v = streams.find((s) => s.codec_type === 'video') || null;
  const a = streams.find((s) => s.codec_type === 'audio') || null;
  const fmt = (j && j.format) || {};
  return {
    container: fmt.format_name || null,
    duration: num(fmt.duration),
    video: v && {
      codec: v.codec_name,
      profile: v.profile || null,
      width: v.width,
      height: v.height,
      fps: frameRate(v.avg_frame_rate) || frameRate(v.r_frame_rate),
      pixFmt: v.pix_fmt || null,
      frames: num(v.nb_frames),
    },
    audio: a && { codec: a.codec_name, sampleRate: num(a.sample_rate), channels: a.channels },
  };
}

export function probeMedia(file, bin = 'ffprobe') {
  return summarize(ffprobeJson(file, bin));
}
