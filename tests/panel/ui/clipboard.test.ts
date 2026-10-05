import { describe, it, expect } from 'vitest';
import { copyText } from '../../../panel/src/ui/clipboard';

const TEXT = '{"versions":{"plugin":"0.1.0"},"note":"Ёлка × 2"}';

describe('copyText', () => {
  it('writes through the clipboard API when there is one', async () => {
    const written: string[] = [];
    const ok = await copyText(TEXT, {
      clipboard: { writeText: async (t) => void written.push(t) },
      legacy: () => {
        throw new Error('not needed');
      },
    });
    expect(ok).toBe(true);
    expect(written).toEqual([TEXT]);
  });

  it('falls back to the textarea when the clipboard API is missing', async () => {
    const copied: string[] = [];
    const ok = await copyText(TEXT, { legacy: (t) => (copied.push(t), true) });
    expect(ok).toBe(true);
    expect(copied).toEqual([TEXT]);
  });

  it('falls back when the clipboard API refuses (no permission, no focus in a CEP panel)', async () => {
    const copied: string[] = [];
    const ok = await copyText(TEXT, {
      clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
      legacy: (t) => (copied.push(t), true),
    });
    expect(ok).toBe(true);
    expect(copied).toEqual([TEXT]);
  });

  it('falls back when the clipboard API throws at once', async () => {
    const ok = await copyText(TEXT, {
      clipboard: {
        writeText: () => {
          throw new Error('boom');
        },
      },
      legacy: () => true,
    });
    expect(ok).toBe(true);
  });

  it('says it failed when nothing could copy', async () => {
    expect(await copyText(TEXT, {})).toBe(false);
    expect(await copyText(TEXT, { legacy: () => false })).toBe(false);
    expect(
      await copyText(TEXT, {
        clipboard: { writeText: () => Promise.reject(new Error('no')) },
        legacy: () => {
          throw new Error('no execCommand');
        },
      }),
    ).toBe(false);
  });
});
