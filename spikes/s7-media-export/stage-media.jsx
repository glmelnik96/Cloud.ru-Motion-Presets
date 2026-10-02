// S7 stage "media" (Premiere, ES3, after spikes/lib/pr-helpers.jsx): ProRes 4444 with alpha and a WAV
// imported into CRT_Media and overwritten onto free tracks of a fixture clone; a frame before and after
// the alpha clip at the same moment for the Node check. Track indices are 0-based.
var P = PARAMS;
var tpf = Number(P.tpf);
var data = { frames: {} };
var seq = null;
var bin = null;
var alpha = null;
var wav = null;
var shot = secToFrames(P.shotSec, tpf);

var ready = projectCheck();
if (ready) {
  seq = workCloneCheck(data);
  ready = !!seq;
}

if (ready) {
  check('media bin ' + P.binName + ' ready', function () {
    bin = ensureBin(P.binName);
    return { pass: !!bin, detail: bin ? String(bin.name) : null };
  });
}

if (ready && bin) {
  check('ProRes 4444 with alpha imported', function () {
    var r = importFile(P.alpha, bin, 10000);
    var fi;
    alpha = r.item;
    data.alphaImport = { attempts: r.attempts, ms: r.ms, reused: r.reused };
    if (alpha) {
      // ProjectItem.getFootageInterpretation(): https://ppro-scripting.docsforadobe.dev/item/projectitem/
      try {
        fi = alpha.getFootageInterpretation();
        data.alphaInterp = { alphaUsage: fi.alphaUsage, ignoreAlpha: fi.ignoreAlpha, invertAlpha: fi.invertAlpha, frameRate: fi.frameRate };
      } catch (e) {
        data.alphaInterp = 'EXC: ' + String(e);
      }
    }
    return { pass: !!alpha, detail: { importInfo: data.alphaImport, interpretation: data.alphaInterp || null } };
  });
  check('WAV imported', function () {
    var r = importFile(P.wav, bin, 10000);
    wav = r.item;
    return { pass: !!wav, detail: { attempts: r.attempts, ms: r.ms, reused: r.reused } };
  });
  frameCheck(seq, data, 'alphaBefore', shot);
}

if (ready && alpha) {
  check('alpha clip overwritten onto the first free video track above V1 at 0 s', function () {
    var v = firstFreeTrack(seq.videoTracks, 1, 0, P.clipSec);
    var r;
    if (v < 0) {
      return { pass: false, detail: 'no free video track over 0-' + P.clipSec + ' s' };
    }
    r = placeClip(seq.videoTracks[v], alpha, 0, tpf);
    data.alphaTrack = 'V' + (v + 1);
    data.alphaTimes = r.clip ? clipTimes(r.clip, tpf) : null;
    return {
      pass: !!r.clip && data.alphaTimes.endF - data.alphaTimes.startF === secToFrames(P.clipSec, tpf),
      detail: { track: data.alphaTrack, times: data.alphaTimes }
    };
  });
  frameCheck(seq, data, 'alphaAfter', shot);
}

if (ready && wav) {
  check('WAV overwritten onto the first free audio track at 0 s', function () {
    var a = firstFreeTrack(seq.audioTracks, 0, 0, P.clipSec);
    var r;
    if (a < 0) {
      return { pass: false, detail: 'no free audio track over 0-' + P.clipSec + ' s' };
    }
    r = placeClip(seq.audioTracks[a], wav, 0, tpf);
    data.wavTrack = 'A' + (a + 1);
    data.wavTimes = r.clip ? clipTimes(r.clip, tpf) : null;
    return {
      pass: !!r.clip && Math.abs(data.wavTimes.endF - data.wavTimes.startF - secToFrames(P.clipSec, tpf)) <= 1,
      detail: { track: data.wavTrack, times: data.wavTimes }
    };
  });
  // Audio-only files are interpreted at their own rate, so their edges may miss the 25p grid
  // (premiere-autopilot SKILL.md, "Times, in/out points").
  check('WAV clip edges lie on the 25p frame grid', function () {
    return { pass: !!data.wavTimes && data.wavTimes.onGrid, detail: data.wavTimes || null };
  }, false);
}

finish(data);
