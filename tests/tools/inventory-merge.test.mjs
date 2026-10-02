import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gpuScore, pickWeakest, renderInventory, loadInventories, fontBuilds } from '../../tools/inventory/merge.mjs';

const fonts = (semibold) => [
  { postScriptName: 'SBSansDisplay-Regular', version: '1.002' },
  { postScriptName: 'SBSansDisplay-Semibold', version: semibold },
  { postScriptName: 'SBSansDisplay-Bold', version: '1.002' },
  { postScriptName: 'SBSansText-Regular', version: '1.003' },
];
const machine = (label, ramGB, gpus, extra = {}) => ({
  schema: 'brandkit-inventory/1',
  label,
  os: { name: 'Windows 11 Pro', version: '24H2', build: '10.0.26100' },
  cpu: { name: 'CPU', cores: 8, threads: 16 },
  ramGB,
  gpus,
  adobe: { afterEffects: [{ version: '26.3' }], premiere: [{ version: '26.3.2' }], mediaEncoder: [{ version: '26.3.2' }] },
  creativeCloud: { present: true, version: '6.10.0.253' },
  upia: { present: true },
  cep: { 'CSXS.11': '1', 'CSXS.12': '1' },
  fonts: fonts('1.002'),
  manual: { adobeIdSignedIn: null },
  ...extra,
});

const strong = machine('edit-strong', 64, [{ name: 'NVIDIA GeForce RTX 4070', vramGB: 12 }]);
const weakPc = machine('edit-weak', 16, [{ name: 'Intel(R) UHD Graphics 770', vramGB: 2 }], { fonts: fonts('1.000') });
const mac = machine('edit-mac', 16, [{ name: 'Apple M1', vramGB: null, cores: 8 }], {
  os: { name: 'macOS', version: '15.6.1', build: '24G90' },
  adobe: { afterEffects: [{ version: '26.5' }], premiere: [{ version: '26.3.2' }], mediaEncoder: [] },
});

describe('inventory merge', () => {
  it('scores GPUs: dedicated VRAM, Apple cores / 2, integrated 0', () => {
    expect(gpuScore(strong)).toBe(12);
    expect(gpuScore(weakPc)).toBe(0);
    expect(gpuScore(mac)).toBe(4);
    expect(gpuScore(machine('two', 32, [{ name: 'AMD Radeon(TM) Graphics', vramGB: 2 }, { name: 'NVIDIA GeForce RTX 5060 Ti', vramGB: 15.9 }]))).toBe(15.9);
  });
  it('picks the weakest machine by RAM, then by GPU', () => {
    expect(pickWeakest([strong, mac, weakPc]).label).toBe('edit-weak');
    expect(pickWeakest([strong, mac]).label).toBe('edit-mac');
    expect(pickWeakest([])).toBeNull();
  });
  it('reads key SB Sans builds or reports that they were not read', () => {
    expect(fontBuilds(weakPc)['SBSansDisplay-Semibold']).toBe('1.000');
    expect(fontBuilds({ ...strong, fonts: null })).toBeNull();
  });
  it('renders a table, the S8 choice and the discrepancies', () => {
    const md = renderInventory([strong, weakPc, mac]);
    expect(md).toContain('| edit-strong | Windows 11 Pro 24H2 (10.0.26100) |');
    expect(md).toContain('**edit-weak**: RAM 16 ГБ');
    expect(md).toContain('- SBSansDisplay-Semibold: 1.002 — edit-strong, edit-mac; 1.000 — edit-weak');
    expect(md).toContain('- After Effects: edit-strong 26.3; edit-weak 26.3; edit-mac 26.5');
    expect(md).toContain('| спросить |');
  });
  it('loads a folder of JSON files, BOM included', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bk-inv-'));
    writeFileSync(path.join(dir, 'a.json'), String.fromCharCode(0xfeff) + JSON.stringify(strong));
    writeFileSync(path.join(dir, 'b.json'), JSON.stringify(mac));
    writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    expect(loadInventories([dir]).map((m) => m.label)).toEqual(['edit-strong', 'edit-mac']);
  });
});
