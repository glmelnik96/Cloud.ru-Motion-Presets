// Paths that differ on macOS and are only checked on a Mac by hand (checkpoint part B): the system paths of
// CEP, Documents, the shared library and logs, Finder for «Показать в папке» (aerender next to the AE bundle:
// export-adapters.test.mjs).
import { describe, expect, it } from 'vitest';
import { libraryRoot, logDir, systemPathToFs } from '../../panel/src/core/paths';
import { documentsPath } from '../../panel/src/services/cep';
import { revealCommand } from '../../panel/src/services/export';

describe('system paths of CEP', () => {
  it('decodes file URLs of both systems, with Cyrillic and spaces', () => {
    expect(systemPathToFs('file:///Users/%D0%93%D0%BB%D0%B5%D0%B1/Documents', 'mac')).toBe('/Users/Глеб/Documents');
    expect(systemPathToFs('file:///C:/Users/%D0%93%D0%BB%D0%B5%D0%B1/Documents', 'win')).toBe('C:/Users/Глеб/Documents');
    expect(systemPathToFs('file:///Library/Application%20Support/Adobe/CEP/extensions/ru.cloud.brandkit/', 'mac')).toBe('/Library/Application Support/Adobe/CEP/extensions/ru.cloud.brandkit');
    expect(systemPathToFs('C:\\Users\\u\\Documents', 'win')).toBe('C:/Users/u/Documents');
    expect(systemPathToFs('/Users/u/100%', 'mac')).toBe('/Users/u/100%');
  });

  it('Documents falls back to the profile folder when CEP gives nothing or throws', () => {
    expect(documentsPath(() => 'file:///Users/u/Documents', 'mac', {})).toBe('/Users/u/Documents');
    expect(documentsPath(() => '', 'mac', { HOME: '/Users/u' })).toBe('/Users/u/Documents');
    expect(documentsPath(() => { throw new Error('no CEP'); }, 'win', { USERPROFILE: 'C:/Users/u' })).toBe('C:/Users/u/Documents');
  });

  it('the shared library and the logs of the Mac', () => {
    expect(libraryRoot('mac')).toBe('/Users/Shared/CloudRuBrandKit/library');
    expect(logDir('mac', { HOME: '/Users/u' })).toBe('/Users/u/Library/Logs/CloudRuBrandKit');
  });

  it('Finder shows the file, or its folder while the file is not there', () => {
    expect(revealCommand('mac', '/Users/u/Documents/Cloud.ru BrandKit/Export/a b.mp4', true)).toEqual({ cmd: 'open', args: ['-R', '/Users/u/Documents/Cloud.ru BrandKit/Export/a b.mp4'], verbatim: false });
    expect(revealCommand('mac', '/p/Export/a.mp4', false)).toEqual({ cmd: 'open', args: ['/p/Export'], verbatim: false });
  });
});
