import { describe, it, expect } from 'vitest';
import { aspectLabel, fpsLabel, formatChip, hasExactVariant, variantAspect, variantLabel } from '../../../panel/src/ui/format';
import type { HostContext, Item } from '../../../panel/src/core/types';
import { aeCtx, catalog, item, prCtx } from '../core/fixture';

type Target = NonNullable<HostContext['target']>;
const targetOf = (over: Partial<Target> = {}): Target => prCtx(over).target!;
const TTL = (): Item => item('TTL_LowerThird');

describe('fpsLabel', () => {
  it('writes whole rates as 25p and drops float noise', () => {
    expect(fpsLabel(25)).toBe('25p');
    expect(fpsLabel(24)).toBe('24p');
    expect(fpsLabel(30)).toBe('30p');
    expect(fpsLabel(50)).toBe('50p');
    expect(fpsLabel(60)).toBe('60p');
    expect(fpsLabel(25.000000001)).toBe('25p');
  });

  it('writes NTSC rates with a decimal comma, as the editor says them', () => {
    expect(fpsLabel(29.97)).toBe('29,97p');
    expect(fpsLabel(30000 / 1001)).toBe('29,97p');
    expect(fpsLabel(23.976)).toBe('23,976p');
    expect(fpsLabel(24000 / 1001)).toBe('23,976p');
    expect(fpsLabel(59.94)).toBe('59,94p');
    expect(fpsLabel(60000 / 1001)).toBe('59,94p');
  });

  it('has nothing to say about a rate that is not one', () => {
    expect(fpsLabel(0)).toBe('');
    expect(fpsLabel(-25)).toBe('');
    expect(fpsLabel(Number.NaN)).toBe('');
    expect(fpsLabel(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('aspectLabel', () => {
  it('names the aspects of the library', () => {
    expect(aspectLabel(1920, 1080)).toBe('16:9');
    expect(aspectLabel(3840, 2160)).toBe('16:9');
    expect(aspectLabel(2560, 1440)).toBe('16:9');
    expect(aspectLabel(1080, 1920)).toBe('9:16');
    expect(aspectLabel(1080, 1080)).toBe('1:1');
    expect(aspectLabel(1080, 1350)).toBe('4:5');
    expect(aspectLabel(1440, 1080)).toBe('4:3');
  });

  it('allows the one percent the library allows (1366x768 is a 16:9 screen)', () => {
    expect(aspectLabel(1366, 768)).toBe('16:9');
    expect(aspectLabel(1000, 1001)).toBe('1:1');
  });

  it('reduces another aspect, and gives a ratio when the reduced one is clumsy', () => {
    expect(aspectLabel(1920, 1200)).toBe('8:5');
    expect(aspectLabel(1080, 1440)).toBe('3:4');
    expect(aspectLabel(2560, 1080)).toBe('2,37:1');
    expect(aspectLabel(1440, 3440)).toBe('1:2,39');
  });

  it('says nothing for a frame that is not one', () => {
    expect(aspectLabel(0, 1080)).toBe('');
    expect(aspectLabel(1920, 0)).toBe('');
    expect(aspectLabel(Number.NaN, 1080)).toBe('');
  });
});

describe('variants', () => {
  it('takes the aspect from the variant, else from its size', () => {
    const [v169, v4k, v916, v11] = TTL().variants;
    expect(variantAspect(v169!)).toBe('16:9');
    expect(variantAspect(v4k!)).toBe('16:9');
    expect(variantAspect(v916!)).toBe('9:16');
    expect(variantAspect(v11!)).toBe('1:1');
    expect(variantAspect({ key: 'x', w: 1440, h: 1080, minHostVersion: {} })).toBe('4:3');
    expect(variantAspect({ key: 'x', minHostVersion: {} })).toBe('');
  });

  it('labels a variant by aspect and size, or by key when it has no size', () => {
    const [v169, v4k, v916, v11] = TTL().variants;
    expect(variantLabel(v169!)).toBe('16:9 · 1920×1080');
    expect(variantLabel(v4k!)).toBe('16:9 · 3840×2160');
    expect(variantLabel(v916!)).toBe('9:16 · 1080×1920');
    expect(variantLabel(v11!)).toBe('1:1 · 1080×1080');
    expect(variantLabel({ key: 'LOOP_a', minHostVersion: {} })).toBe('LOOP_a');
  });
});

describe('formatChip: no item open', () => {
  it('shows the format of the target, chosen automatically', () => {
    const chip = formatChip({ host: 'pr', reachable: true, target: targetOf() });
    expect(chip.text).toBe('Авто 16:9 · 25p');
    expect(chip.tone).toBe('ok');
    expect(chip.title).toBe('1920×1080');
    expect(chip.options).toBeNull();
    expect(formatChip({ host: 'ae', reachable: true, target: aeCtx({ w: 1080, h: 1920, fps: 30 }).target }).text).toBe('Авто 9:16 · 30p');
  });

  it('says no template has a variant for the frame, when none has', () => {
    const chip = formatChip({ host: 'pr', reachable: true, target: targetOf({ w: 2560, h: 1440 }), anyExact: false });
    expect(chip.text).toBe('Нет вариантов под 2560×1440');
    expect(chip.tone).toBe('warn');
    expect(chip.options).toBeNull();
    // unknown, or true: the frame is fine as far as anyone knows
    expect(formatChip({ host: 'pr', reachable: true, target: targetOf({ w: 2560, h: 1440 }) }).text).toBe('Авто 16:9 · 25p');
    expect(formatChip({ host: 'pr', reachable: true, target: targetOf(), anyExact: true }).text).toBe('Авто 16:9 · 25p');
  });

  it('says there is no target, in the words of the host', () => {
    expect(formatChip({ host: 'pr', reachable: true, target: null }).text).toBe('Нет активной секвенции');
    expect(formatChip({ host: 'ae', reachable: true, target: null }).text).toBe('Нет активной композиции');
    expect(formatChip({ host: 'ae', reachable: true, target: null }).tone).toBe('warn');
    expect(formatChip({ host: 'pr', reachable: true, target: undefined }).text).toBe('Определяю формат…');
  });

  it('says the host does not answer', () => {
    const chip = formatChip({ host: 'pr', reachable: false, target: undefined });
    expect(chip.text).toBe('Нет связи с приложением');
    expect(chip.tone).toBe('error');
    expect(chip.options).toBeNull();
  });
});

describe('formatChip: an item is open', () => {
  it('picks the exact frame by itself', () => {
    const chip = formatChip({ host: 'pr', reachable: true, target: targetOf(), item: TTL() });
    expect(chip.text).toBe('Авто 16:9 · 25p');
    expect(chip.tone).toBe('ok');
    expect(chip.title).toBe('Вариант 16:9 · 1920×1080');
  });

  it('tells the 4K frame from the HD one by the title, the text stays the aspect', () => {
    const chip = formatChip({ host: 'pr', reachable: true, target: targetOf({ w: 3840, h: 2160 }), item: TTL() });
    expect(chip.text).toBe('Авто 16:9 · 25p');
    expect(chip.title).toBe('Вариант 16:9 · 3840×2160');
  });

  it('says there is no variant and offers the nearest aspect', () => {
    const chip = formatChip({ host: 'pr', reachable: true, target: targetOf({ w: 2560, h: 1440 }), item: TTL() });
    expect(chip.text).toBe('Нет варианта: 2560×1440 → ближайший 16:9');
    expect(chip.tone).toBe('warn');
    expect(chip.title).toBe('Ближайший вариант: 16:9 · 1920×1080. Его можно выбрать вручную.');
  });

  it('says there is no variant when there is no variant to offer', () => {
    const bare: Item = { ...TTL(), variants: [{ key: 'loop', minHostVersion: {} }] };
    const chip = formatChip({ host: 'pr', reachable: true, target: targetOf({ w: 2560, h: 1440 }), item: bare });
    expect(chip.text).toBe('Нет варианта: 2560×1440');
  });

  it('shows a manual choice as such', () => {
    const chip = formatChip({
      host: 'pr', reachable: true, target: targetOf({ w: 2560, h: 1440 }), item: TTL(), manualKey: '16x9_4K',
    });
    expect(chip.text).toBe('Вручную: 16:9 · 3840×2160 · 25p');
    expect(chip.tone).toBe('ok');
    expect(chip.title).toBe('Вариант выбран вручную. «Авто» вернёт выбор по формату цели.');
  });

  it('ignores a manual key the item does not have', () => {
    const chip = formatChip({ host: 'pr', reachable: true, target: targetOf(), item: TTL(), manualKey: 'gone' });
    expect(chip.text).toBe('Авто 16:9 · 25p');
  });

  it('lists the choice: auto first, then every variant, marking the selected one', () => {
    const auto = formatChip({ host: 'pr', reachable: true, target: targetOf(), item: TTL() });
    expect(auto.options).toEqual([
      { key: null, label: 'Авто по формату цели', selected: true },
      { key: '16x9', label: '16:9 · 1920×1080', hint: 'точное совпадение', selected: false },
      { key: '16x9_4K', label: '16:9 · 3840×2160', selected: false },
      { key: '9x16', label: '9:16 · 1080×1920', selected: false },
      { key: '1x1', label: '1:1 · 1080×1080', selected: false },
    ]);
    const manual = formatChip({ host: 'pr', reachable: true, target: targetOf({ w: 2560, h: 1440 }), item: TTL(), manualKey: '9x16' });
    expect(manual.options?.map((o) => [o.key, o.selected])).toEqual([
      [null, false], ['16x9', false], ['16x9_4K', false], ['9x16', true], ['1x1', false],
    ]);
  });

  it('marks the nearest variant in the list when there is no exact one', () => {
    const chip = formatChip({ host: 'pr', reachable: true, target: targetOf({ w: 2560, h: 1440 }), item: TTL() });
    expect(chip.options?.map((o) => [o.key, o.hint ?? null, o.selected])).toEqual([
      [null, null, true], ['16x9', 'ближайший', false], ['16x9_4K', null, false], ['9x16', null, false], ['1x1', null, false],
    ]);
  });

  it('has no list without a target: nothing to choose against', () => {
    expect(formatChip({ host: 'pr', reachable: true, target: null, item: TTL() }).options).toBeNull();
    expect(formatChip({ host: 'pr', reachable: false, target: undefined, item: TTL() }).options).toBeNull();
  });

  it('shows a frame rate that is not the template\'s as the target\'s', () => {
    const chip = formatChip({ host: 'ae', reachable: true, target: aeCtx({ fps: 29.97 }).target, item: TTL() });
    expect(chip.text).toBe('Авто 16:9 · 29,97p');
  });
});

describe('hasExactVariant', () => {
  it('is true when some item has a variant of exactly the frame of the target', () => {
    expect(hasExactVariant(catalog().items, targetOf())).toBe(true); // 1920x1080
    expect(hasExactVariant(catalog().items, targetOf({ w: 1080, h: 1080 }))).toBe(true); // only TTL has 1x1
  });

  it('is false when none has: the same aspect is not the same frame', () => {
    expect(hasExactVariant(catalog().items, targetOf({ w: 2560, h: 1440 }))).toBe(false);
    expect(hasExactVariant(catalog().items, targetOf({ w: 1080, h: 1350 }))).toBe(false);
    expect(hasExactVariant([], targetOf())).toBe(false);
  });
});
