// Live check of «Вписать в окно» in Premiere (spec 6.1, spike S7): stills of a known colour placed and
// selected on V2, planFit and runFit through the Bridge, then a frame rendered by Premiere where the colour
// must fill exactly the window of the frame template (the windows of WEB_Screen in the example source).
// tests/panel/fit-live.test.mjs runs it dry on the fake.
import { planFit, runFit } from '../../panel/src/core/fit.ts';

export const FIT_CASES = [
  // a 16:9 still into the 16:9 screen window: scaled, no Crop
  { key: 'screen', window: 'screen', clip: 'screen', hex: '#26D07C', crop: false },
  // a 16:9 still into the portrait speaker window: by its height, the sides cut with Crop through QE
  { key: 'speaker', window: 'speaker', clip: 'speaker', hex: '#A068FF', crop: true },
];

const near = (a, b, eps) => a !== null && a !== undefined && Math.abs(a - b) <= eps;

export async function runFitLive(o) {
  const { bridge, hostRun, R, item } = o;
  const setup = R.fromHost('fit: setup', await hostRun('setup', { targets: [{ key: 'fit', name: 'BK fit', w: 1920, h: 1080, fps: 25 }] }));
  const id = setup?.ids?.fit;
  if (!id) return;
  for (let n = 0; n < FIT_CASES.length; n += 1) {
    const c = FIT_CASES[n];
    const at = n * 10;
    const name = `fit ${c.key}`;
    if (!R.fromHost(`${name}: place`, await hostRun('fitPlace', { id, file: o.clips[c.clip], track: 1, startSec: at }))) continue;
    R.fromHost(`${name}: activate`, await hostRun('activate', { id, time: at + 1 }));
    const ctx = (await bridge.call('getContext')).data;
    const plan = planFit(item, ctx, {}, c.window);
    if (!R.check(`${name}: planned`, plan.ok, plan.problems)) continue;
    const out = await runFit(bridge, plan.request);
    if (!R.check(`${name}: fitted`, out.ok, { problems: out.problems, reply: out.reply })) continue;
    R.check(`${name}: the clip's frame size read from the project (1920 x 1080)`, out.numbers !== null, out.numbers);
    R.check(`${name}: Scale and Position read back`, near(out.reply.scale, out.numbers.scale, 0.01) && near(out.reply.position[0], out.numbers.position[0], 0.5) && near(out.reply.position[1], out.numbers.position[1], 0.5), { reply: out.reply, numbers: out.numbers });
    R.check(`${name}: ${c.crop ? 'Crop added through QE and set' : 'no Crop'}`, c.crop ? out.reply.cropAdded && !out.reply.cropMissing && near(out.reply.crop?.left, out.numbers.crop.left, 0.01) : out.reply.crop === null, out.reply);
    const frame = await o.frame(id, (at + 1) * 25, `fit-${c.key}`);
    if (!R.check(`${name}: frame rendered`, !!frame, frame)) continue;
    const box = o.colorBox(frame, c.hex);
    const r = plan.request.rect;
    R.check(`${name}: the colour fills the window ${r.x},${r.y} ${r.w}x${r.h} and nothing else (±4 px)`, box && near(box.x0, r.x, 4) && near(box.y0, r.y, 4) && near(box.w, r.w, 4) && near(box.h, r.h, 4), { box, rect: r });
  }
}
