import { describe, expect, it } from 'vitest';
import { mapTime, regions, SPEED_CTRL, SPEEDS, timeMapJs } from '../../tools/masters/speed.mjs';

const LOGO = { introEnd: 2.12, outroStart: 3.96, duration: 5 };

describe('speed', () => {
  it('plays the intro and the outro at the chosen speed, holds in between', () => {
    expect(mapTime(1, { ...LOGO, speed: 1 })).toBe(1);
    expect(mapTime(1, { ...LOGO, speed: 2 })).toBe(2);
    expect(mapTime(1.5, { ...LOGO, speed: 2 })).toBe(2.12);            // intro done at 1.06 s
    expect(mapTime(4.5, { ...LOGO, speed: 2 })).toBe(4);               // outro starts at 4.48 s
    expect(mapTime(5, { ...LOGO, speed: 0.75 })).toBe(5);
    expect(mapTime(2.83, { ...LOGO, speed: 0.75 })).toBeCloseTo(2.12, 2);
  });

  it('sizes the protected regions for the slowest speed, on the frame grid', () => {
    const r = regions({ ...LOGO, fps: 25 });
    expect(r.markers).toEqual([{ comment: 'in', time: 0, duration: 2.84 }, { comment: 'out', time: 3.6, duration: 1.4 }]);
    expect(r.duration).toEqual({ introSec: 2.84, holdSec: 0.76, outroSec: 1.4 });
    expect(() => regions({ introEnd: 2.2, outroStart: 3.0, duration: 3.6, fps: 25 })).toThrow(/lengthen the master/);
  });

  it('writes the same map as an expression', () => {
    const js = timeMapJs(LOGO);
    expect(js).toContain(`[${SPEEDS.join(', ')}]`);
    const T = new Function('thisComp', 'speedIndex', `${js.replace('thisComp.layer("CTRL").effect("Speed")(1).value', 'speedIndex')}; return T;`);
    const comp = { duration: 5 };
    for (const [i, s] of SPEEDS.entries()) {
      for (const t of [0, 0.5, 1.2, 2.5, 3.7, 4.4, 5]) expect(T(comp, i + 1)(t)).toBeCloseTo(mapTime(t, { ...LOGO, speed: s }), 9);
    }
    expect(SPEED_CTRL.items[SPEED_CTRL.value - 1]).toBe('1×');
  });
});
