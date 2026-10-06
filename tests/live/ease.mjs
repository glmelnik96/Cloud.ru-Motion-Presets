// Live check of «Движение» in After Effects (D19 «Фирменные кривые»): a solid with keys on Position and Scale,
// the first two keys of each selected; the curve M4 «вход» (out 67 %, in 89 %) through planEase, runEase and the
// Bridge; the test bed reads the eases back: the selected pairs have them with speed 0, the third Position key
// keeps its own, every dimension of Scale has its entry. tests/panel/ease-live.test.mjs runs it dry on the fake.
import { brandCurves, planEase, runEase } from '../../panel/src/core/ease.ts';

const near = (a, b) => Math.abs(Number(a) - b) <= 0.05;

export async function runEaseLive(o) {
  const { bridge, hostRun, R } = o;
  const setup = R.fromHost('ease: setup', await hostRun('setup', { project: o.project, targets: [{ key: 'ease', name: 'BK ease', w: 1920, h: 1080, fps: 25, dur: 10 }] }));
  const id = setup?.ids?.ease;
  if (!id) return;
  if (!R.fromHost('ease: keys selected', await hostRun('easeLayer', { id }))) return;
  const curve = brandCurves().find((c) => c.key === 'M4.in');
  const ctx = (await bridge.call('getContext')).data;
  const plan = planEase(ctx, curve);
  if (!R.check('ease: planned', !!plan.request, plan.problems)) return;
  const out = await runEase(bridge, plan.request);
  if (!R.check('ease: set on Position and Scale, one pair each', out.ok && out.reply.props.length === 2 && out.reply.props.every((p) => p.pairs === 1), out)) return;
  const e = R.fromHost('ease: read back', await hostRun('easeRead', { id }))?.eases;
  if (!e) return;
  const pos = e['ADBE Position'];
  const sc = e['ADBE Scale'];
  R.check('ease: Position key 1 out 67 %, key 2 in 89 %, speed 0, Bezier', near(pos[0].outEase[0].influence, 67) && near(pos[1].inEase[0].influence, 89) && pos[0].outEase[0].speed === 0 && pos[1].inEase[0].speed === 0 && pos[0].out === 'bezier', pos);
  R.check('ease: the third Position key and the out side of the second are not touched', !near(pos[2].inEase[0].influence, 89) && !near(pos[1].outEase[0].influence, 67), pos);
  R.check('ease: Scale has the curve in every dimension', sc[0].outEase.length === 3 && sc[0].outEase.every((x) => near(x.influence, 67)) && sc[1].inEase.every((x) => near(x.influence, 89)), sc);
}
