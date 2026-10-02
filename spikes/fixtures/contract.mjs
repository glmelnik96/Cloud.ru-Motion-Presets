// The shared AE fixture contract (plan part B): names, values and paths that the phase-0 spikes rely on.
// Change it only together with build-ae-fixture.jsx and the plan text.
import { workDir, workPath } from '../../tools/lib/work.mjs';

export const COMP_LT = 'CRT_LowerThird_v1';
export const COMP_HATCH = 'CRT_Hatch_v1';

// Essential Graphics properties that S1 adds, in this order. label = display name in the EGP.
export const EGP = {
  [COMP_LT]: [
    { key: 'name', kind: 'text', layer: 'TXT_NAME', label: 'Имя', required: true },
    { key: 'role', kind: 'text', layer: 'TXT_ROLE', label: 'Должность', required: true },
    { key: 'showRole', kind: 'checkbox', layer: 'CTRL', effect: 'ShowRole', matchName: 'ADBE Checkbox Control',
      label: 'Показать должность', required: true },
    { key: 'duration', kind: 'slider', layer: 'CTRL', effect: 'Duration', matchName: 'ADBE Slider Control',
      label: 'Длительность (служебное, не менять)', required: true },
    { key: 'accent', kind: 'color', layer: 'CTRL', effect: 'Accent', matchName: 'ADBE Color Control',
      label: 'Акцент', required: false },
    { key: 'style', kind: 'dropdown', layer: 'CTRL', effect: 'Style', matchName: 'ADBE Dropdown Control',
      label: 'Стиль', required: false },
    { key: 'photo', kind: 'media', layer: 'SLOT_PHOTO', label: 'Фото', required: true },
  ],
  [COMP_HATCH]: [
    { key: 'duration', kind: 'slider', layer: 'CTRL', effect: 'Duration', matchName: 'ADBE Slider Control',
      label: 'Длительность (служебное, не менять)', required: true },
  ],
};

// Protected regions of CRT_LowerThird_v1 (Responsive Design - Time).
export const MARKERS = [
  { comment: 'in', time: 0, duration: 1 },
  { comment: 'out', time: 9, duration: 1 },
];

export function fixturePaths() {
  return {
    workDir: workDir(),
    mediaDir: workPath('fixtures', 'media'),
    slotA: workPath('fixtures', 'media', 'slot_a.png'),
    fixtureAep: workPath('fixtures', 'CRT_fixture.aep'),
    egpAep: workPath('fixtures', 'CRT_fixture_egp.aep'),
    mogrtDir: workPath('mogrt'),
  };
}

// PARAMS for spikes/fixtures/build-ae-fixture.jsx.
export function fixtureParams() {
  const p = fixturePaths();
  return {
    workDir: p.workDir,
    fixtureAep: p.fixtureAep,
    media: { slotA: p.slotA },
    comps: { lt: COMP_LT, hatch: COMP_HATCH },
    w: 1920, h: 1080, fps: 25, ltDuration: 10, hatchDuration: 60,
    text: { name: 'Имя Фамилия', role: 'Должность' },
    fonts: { name: 'SBSansDisplay-Semibold', role: 'SBSansText-Regular' },
    markers: MARKERS,
  };
}
