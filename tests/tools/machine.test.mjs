import { describe, it, expect } from 'vitest';
import { machineInfo } from '../../tools/spike/machine.mjs';

describe('machineInfo', () => {
  it('reports platform, CPU and RAM without the GPU query', () => {
    const m = machineInfo({ gpu: false });
    expect(m.platform).toBe(process.platform);
    expect(m.threads).toBeGreaterThan(0);
    expect(m.ramGb).toBeGreaterThan(0);
    expect(m.gpus).toEqual([]);
  });
});
