// ffprobe fields the export research compares. Builds on tools/lib/media-probe.mjs.
import { ffprobeJson, summarize } from '../../tools/lib/media-probe.mjs';

const num = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function probeExport(file) {
  const j = ffprobeJson(file);
  const s = summarize(j);
  const streams = j.streams || [];
  const v = streams.find((x) => x.codec_type === 'video') || null;
  const a = streams.find((x) => x.codec_type === 'audio') || null;
  const fmt = j.format || {};
  return {
    container: s.container,
    duration: s.duration,
    formatBitrate: num(fmt.bit_rate),
    bytes: num(fmt.size),
    video: s.video && {
      codec: s.video.codec,
      profile: v.profile || null,
      level: v.level === undefined ? null : v.level,
      width: s.video.width,
      height: s.video.height,
      fps: s.video.fps,
      pixFmt: s.video.pixFmt,
      frames: s.video.frames,
      bitrate: num(v.bit_rate),
      fieldOrder: v.field_order || null,
      sar: v.sample_aspect_ratio || null,
    },
    audio: s.audio && {
      codec: s.audio.codec,
      sampleRate: s.audio.sampleRate,
      channels: s.audio.channels,
      bitrate: a ? num(a.bit_rate) : null,
      layout: a ? (a.channel_layout || null) : null,
    },
  };
}

function close(a, b, tol) {
  if (a === null || b === null || a === undefined || b === undefined) return false;
  return Math.abs(Number(a) - Number(b)) <= tol;
}

// The sequence is 1920x1080 25p. A field that matches the preset and differs from the sequence
// came from the preset. A field that matches the sequence and differs from the preset came from
// the sequence. When both agree, the export does not say which one won.
export function attribute(preset, file, sequence) {
  const v = file && file.video;
  const pv = preset.video;
  const notes = [];
  if (!v) return { error: 'no video stream', notes };
  const sizePreset = v.width === pv.width && v.height === pv.height;
  const sizeSeq = v.width === sequence.width && v.height === sequence.height;
  const fpsPreset = close(v.fps, pv.fps, 0.02);
  const fpsSeq = close(v.fps, sequence.fps, 0.02);
  if (sizePreset && !sizeSeq) notes.push('frame size follows the preset');
  else if (sizeSeq && !sizePreset) notes.push('frame size follows the sequence');
  else if (sizePreset && sizeSeq) notes.push('frame size matches both the preset and the sequence');
  else notes.push('frame size matches neither');
  if (fpsPreset && !fpsSeq) notes.push('fps follows the preset (' + pv.fps + ', sequence is ' + sequence.fps + ')');
  else if (fpsSeq && !fpsPreset) notes.push('fps follows the sequence (' + sequence.fps + ', preset asks ' + pv.fps + ')');
  else if (fpsPreset && fpsSeq) notes.push('fps matches both');
  else notes.push('fps matches neither');
  if (file.audio) {
    const ratePreset = file.audio.sampleRate === preset.audio.sampleRate;
    const rateSeq = file.audio.sampleRate === sequence.audioSampleRate;
    if (ratePreset && !rateSeq) notes.push('audio sample rate follows the preset');
    else if (rateSeq && !ratePreset) notes.push('audio sample rate follows the sequence');
    else notes.push('audio sample rate ' + file.audio.sampleRate + ' (preset ' + preset.audio.sampleRate + ')');
    notes.push('audio ' + file.audio.codec + ' ' + file.audio.channels + 'ch ' + (file.audio.bitrate || '?') + ' bps');
  } else notes.push('no audio stream');
  notes.push('ffprobe profile ' + v.profile + ' level ' + v.level + ' (preset profile code ' + pv.profile.code + ', level ' + pv.level.label + ')');
  notes.push('file bitrate ' + file.formatBitrate + ' bps; preset target ' + pv.targetBitrateMbps + ' Mbps, max ' + pv.maxBitrateMbps + ' Mbps');
  return {
    sizeFromPreset: sizePreset && !sizeSeq,
    sizeFromSequence: sizeSeq && !sizePreset,
    fpsFromPreset: fpsPreset && !fpsSeq,
    fpsFromSequence: fpsSeq && !fpsPreset,
    ffprobeProfile: v.profile,
    ffprobeLevel: v.level,
    notes,
  };
}
