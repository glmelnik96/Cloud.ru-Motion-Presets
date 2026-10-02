import { describe, it, expect } from 'vitest';
import { checkFixtureDump } from '../../tools/dump/check-fixture-dump.mjs';

const prop = (matchName, extra) => ({ matchName, name: matchName, ...extra });
const group = (matchName, children) => ({ matchName, name: matchName, group: 'NAMED_GROUP', children });
const key = (time, value, interp = 'LINEAR') => ({ time, value, inInterp: interp, outInterp: interp });

// A dump of CRT_LowerThird_v1 that satisfies the fixture contract (Plan 1, Task 7).
function fixtureDump() {
  return {
    schema: 'crbk-dump/1',
    comp: {
      name: 'CRT_LowerThird_v1', width: 1920, height: 1080, frameRate: 25, duration: 10, renderer: 'ADBE Advanced 3d',
      markers: [{ time: 0, duration: 1, comment: 'in', protectedRegion: true }, { time: 9, duration: 1, comment: 'out', protectedRegion: true }],
    },
    layers: [
      { index: 1, name: 'CTRL', type: 'null', props: [], masks: [], effects: [
        ['ShowRole', 'ADBE Checkbox Control'], ['Duration', 'ADBE Slider Control'], ['Accent', 'ADBE Color Control'],
        ['Style', 'ADBE Dropdown Control'], ['QA', 'ADBE Checkbox Control']].map(([name, matchName], i) => ({ index: i + 1, name, matchName, params: [] })) },
      { index: 2, name: 'TXT_NAME', type: 'text', effects: [], masks: [], props: [
        group('ADBE Text Properties', [prop('ADBE Text Document', { pvt: 'TEXT_DOCUMENT', value: { text: 'Имя Фамилия', font: 'SBSansDisplay-Semibold', fontSize: 60 } })])] },
      { index: 3, name: 'TXT_ROLE', type: 'text', effects: [], masks: [], props: [
        group('ADBE Transform Group', [prop('ADBE Opacity', { pvt: 'OneD', value: 100,
          expression: { text: 'thisComp.layer("CTRL").effect("ShowRole")(1) * 100', enabled: true, valueAt0: 100, error: '' } })])] },
      { index: 4, name: 'PROBE_SQ', type: 'av', effects: [], masks: [], props: [
        group('ADBE Transform Group', [prop('ADBE Position', { pvt: 'ThreeD_SPATIAL',
          keys: [key(0, [100, 100, 0]), key(1, [200, 100, 0]), key(9, [200, 100, 0]), key(10, [300, 100, 0])] })])] },
    ],
  };
}

const failed = (d) => checkFixtureDump(d).filter((c) => !c.pass).map((c) => c.name);

describe('checkFixtureDump', () => {
  it('passes on a dump that matches the fixture contract', () => {
    expect(failed(fixtureDump())).toEqual([]);
    expect(checkFixtureDump(fixtureDump())).toHaveLength(9);
  });

  it('catches a wrong font name (SemiBold with a capital B, ae-quirks #187)', () => {
    const d = fixtureDump();
    d.layers[1].props[0].children[0].value.font = 'SBSansDisplay-SemiBold';
    expect(failed(d)).toEqual(['TXT_NAME font is SBSansDisplay-Semibold']);
  });

  it('catches a bezier key and a missing key', () => {
    const d = fixtureDump();
    const keys = d.layers[3].props[0].children[0].keys;
    keys[0].outInterp = 'BEZIER';
    expect(failed(d)).toEqual(['PROBE_SQ keys are linear']);
    keys.pop();
    expect(failed(d)).toEqual([
      'PROBE_SQ Position has 4 keys', 'PROBE_SQ keys at 0/1/9/10 s = (100,100) (200,100) (200,100) (300,100)', 'PROBE_SQ keys are linear']);
  });

  it('catches an expression that does not give 100', () => {
    const d = fixtureDump();
    d.layers[2].props[0].children[0].expression.valueAt0 = 0;
    expect(failed(d)).toEqual(['TXT_ROLE Opacity expression reads ShowRole and gives 100']);
  });

  it('accepts the dropdown as AE 26.5 dumps it: a pseudo effect whose first parameter is Menu', () => {
    const d = fixtureDump();
    d.layers[0].effects[3].matchName = 'Pseudo/@@H9+Z0L1YQfegdADzjPemfg';
    d.layers[0].effects[3].params = [{ matchName: 'Pseudo/@@H9+Z0L1YQfegdADzjPemfg-0001', name: 'Menu', index: 1 }];
    expect(failed(d)).toEqual([]);
    d.layers[0].effects[3].params = [{ matchName: 'Pseudo/@@x-0001', name: 'Slider', index: 1 }];
    expect(failed(d)).toEqual(['CTRL effects by name and matchName']);
  });

  it('catches a lost protected region and a renamed control', () => {
    const d = fixtureDump();
    d.comp.markers[1].protectedRegion = false;
    d.layers[0].effects[3].matchName = 'ADBE Slider Control';
    expect(failed(d)).toEqual(['comp markers: protected 0-1 s "in", 9-10 s "out"', 'CTRL effects by name and matchName']);
  });
});
