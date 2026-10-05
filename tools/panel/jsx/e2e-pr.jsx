// Live E2E of the panel in Premiere (plan 2026-10-05, task 10), after spikes/lib/check.jsx and spikes/lib/pr-helpers.jsx.
// An observer independent of the panel's adapter: it prepares the target and reads back what the panel inserted.
// It works only when the active project is the E2E fixture (PARAMS.fixture) and never saves it.
// PARAMS: fixture, stage 'prepare' | 'read', seq (fixture sequence name), sec (playhead, s);
//         read: expectName (the clip name), names (Essential Graphics names to read).
// prepare: removes earlier inserts (clips named like <ID>_<format>_v<N>), activates the sequence, sets the playhead.
// read: the one clip of expectName starting at `sec` -> { track, startF, lenF, selected, values }.
var P = PARAMS;
var data = {};
var TEMPLATE_CLIP = /^[A-Z]+_[A-Za-z0-9]+_[A-Za-z0-9_]+_v[0-9]+$/;

var ready = check('fixture is the active project', function () {
  return { pass: sameFsPath(String(app.project.path), new File(P.fixture).fsName), detail: String(app.project.path) };
});

var seq = null;
if (ready) {
  ready = check('sequence ' + P.seq, function () {
    seq = findSequenceByName(P.seq);
    return { pass: !!seq, detail: seq ? String(seq.sequenceID) : 'none' };
  });
}
var tpf = seq ? Number(seq.timebase) : 0;

if (ready && P.stage === 'prepare') {
  check('earlier inserts removed', function () {
    var removed = 0, t, i, c, tracks = seq.videoTracks;
    for (t = 0; t < tracks.numTracks; t++) {
      for (i = tracks[t].clips.numItems - 1; i >= 0; i--) {
        c = tracks[t].clips[i];
        if (TEMPLATE_CLIP.test(String(c.name))) {
          c.remove(false, false);
          removed++;
        }
      }
    }
    return { pass: true, detail: removed };
  });
  check('sequence active at ' + P.sec + ' s', function () {
    var ok = activateSequence(seq);
    seq.setPlayerPosition(String(framesToTicks(secToFrames(P.sec, tpf), tpf)));
    data.seqId = String(seq.sequenceID);
    var at = Number(seq.getPlayerPosition().ticks);
    return { pass: ok && at === framesToTicks(secToFrames(P.sec, tpf), tpf), detail: at };
  });
}

if (ready && P.stage === 'read') {
  check('one clip ' + P.expectName + ' at ' + P.sec + ' s', function () {
    var hits = [], t, c, f = secToFrames(P.sec, tpf), tracks = seq.videoTracks;
    for (t = 0; t < tracks.numTracks; t++) {
      c = clipStartingAt(tracks[t], f, tpf);
      if (c && String(c.name) === P.expectName) {
        hits.push([t, c]);
      }
    }
    if (hits.length !== 1) {
      return { pass: false, detail: hits.length + ' clips' };
    }
    c = hits[0][1];
    data.track = hits[0][0];
    data.startF = ticksToFrames(c.start.ticks, tpf);
    data.lenF = ticksToFrames(Number(c.end.ticks) - Number(c.start.ticks), tpf);
    data.selected = truthy(c.isSelected());
    data.values = [];
    for (var i = 0; i < P.names.length; i++) {
      var p = mgtParam(c, P.names[i]), v = null;
      if (p) {
        v = readMgtText(p);
        if (v === null) {
          v = describeValue(p.getValue()).value;
        }
      }
      data.values.push([P.names[i], v]);
    }
    return { pass: true, detail: data.track };
  });
}

finish(data);
