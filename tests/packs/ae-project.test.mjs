import { describe, it, expect } from 'vitest';
import { acceptOpened, sameProjectFile } from '../../tools/packs/ae-project.mjs';

const COPY = 'C:/CRBK/packs/logo/logo.aep';

describe('acceptOpened', () => {
  it('accepts the file itself, also under the old "(converted)" name', () => {
    expect(acceptOpened({ file: 'C:\\CRBK\\packs\\logo\\logo.aep' }, COPY)).toEqual({ converted: false });
    expect(sameProjectFile('C:\\CRBK\\packs\\logo\\logo (converted).aep', COPY)).toBe(true);
  });
  it('accepts an untitled converted project only with a fingerprint (AE 26.5 keeps it untitled)', () => {
    const r = { file: null, converted: true, fingerprint: { items: 20, first: 'Логошоты' } };
    expect(acceptOpened(r, COPY)).toEqual({ converted: true, fingerprint: { items: 20, first: 'Логошоты' } });
  });
  it('rejects another file and an untitled project without a fingerprint', () => {
    expect(() => acceptOpened({ file: 'C:/CRBK/packs/smm/smm.aep' }, COPY)).toThrow(/OPEN_MISMATCH/);
    expect(() => acceptOpened({ file: null, converted: true }, COPY)).toThrow(/OPEN_MISMATCH/);
    expect(() => acceptOpened({ file: null, converted: true, fingerprint: { items: 0, first: null } }, COPY))
      .toThrow(/OPEN_MISMATCH/);
  });
});
