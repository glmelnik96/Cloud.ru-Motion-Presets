// Host-specific parts of the live checks: how each host shows what the adapter left behind.
// `wait` resolves when the frame files are complete (tools/golden/png.mjs in the live run).
const near = (a, b, eps = 0.002) => Math.abs(Number(a) - Number(b)) <= eps;

function sameKeys(got, want) {
  if (!Array.isArray(got) || !Array.isArray(want) || got.length !== want.length) return false;
  return want.every((k, i) => near(got[i][0], k[0]) && near(got[i][1], k[1]) && got[i][2] === true);
}

export function aeHooks({ wait }) {
  const layer = async (R, hostRun, step, layerId) => R.fromHost(step, await hostRun('layer', { layerId }))?.layer ?? null;
  return {
    async inspectCase({ c, A, B, D, R, hostRun }) {
      const la = await layer(R, hostRun, `${c.key}: layer A`, A.out.reply.layerId);
      const lb = await layer(R, hostRun, `${c.key}: layer B`, B.out.reply.layerId);
      R.check(`${c.key}: A plays as is (no time remap, ${D} s)`, la && !la.timeRemap && near(la.outPoint - la.inPoint, D), la);
      R.check(`${c.key}: B has the time-remap keys of contract C27, linear`, lb && lb.timeRemap && sameKeys(lb.keys, B.plan.request.remap), { got: lb?.keys, want: B.plan.request.remap });
      R.check(`${c.key}: B is the selected layer after its insert`, lb?.selected === true, lb, false);
    },
    async inspectScale({ r, R, hostRun, expect }) {
      const l = await layer(R, hostRun, 'nearest: layer', r.out.reply.layerId);
      R.check(`nearest: layer scaled to ${expect.toFixed(3)} %`, l && near(l.scale[0], expect, 0.01) && near(l.scale[1], expect, 0.01), l?.scale);
    },
    async renderFrames({ key, id, shots, R, hostRun }) {
      R.fromHost(`${key}: frames`, await hostRun('frames', { frames: shots.map((s) => ({ compId: id, t: s.at, file: s.file })) }));
      await wait(shots.map((s) => s.file));
    },
    async count({ id, R, hostRun }) {
      return R.fromHost('count', await hostRun('count', { id }))?.count?.layers ?? -1;
    },
  };
}

export function prHooks({ wait }) {
  const clips = async (R, hostRun, step, id) => R.fromHost(step, await hostRun('clips', { id })) ?? { clips: [] };
  return {
    async inspectCase({ c, D, ids, R, hostRun }) {
      const d = await clips(R, hostRun, `${c.key}: clips`, ids[c.key]);
      const at = (s) => d.clips.find((x) => near(x.startSec, s, 0.021));
      const a = at(2);
      const b = at(20);
      R.check(`${c.key}: A on V2 from 2 s for ${D} s`, a && a.track === 2 && near(a.endSec - a.startSec, D, 0.021), a);
      R.check(`${c.key}: B on V2 from 20 s for ${D + 4} s`, b && b.track === 2 && near(b.endSec - b.startSec, D + 4, 0.021), b);
      R.check(`${c.key}: B is the selected clip after its insert`, b?.selected === true && a?.selected === false, { a, b }, false);
    },
    async inspectScale({ id, R, hostRun, expect }) {
      const d = await clips(R, hostRun, 'nearest: clips', id);
      const c = d.clips.find((x) => near(x.startSec, 2, 0.021));
      R.check(`nearest: Motion scale ${expect.toFixed(3)} %`, c && near(c.scale, expect, 0.01), c);
    },
    async renderFrames({ key, id, fps, shots, R, hostRun }) {
      R.fromHost(`${key}: frames`, await hostRun('frames', { id, frames: shots.map((s) => ({ key: s.name, frame: Math.round(s.at * fps) })) }));
      await wait(shots.map((s) => s.file));
    },
    async count({ id, R, hostRun }) {
      return (await clips(R, hostRun, 'count', id)).clips.length;
    },
  };
}
