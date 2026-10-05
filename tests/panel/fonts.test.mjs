import { describe, expect, it } from 'vitest';
import { fontDirs, readFontNames, scanFontFolders } from '../../panel/src/services/fonts.ts';
import { makeFont as rawFont } from '../helpers/make-font.mjs';

// A Windows-English name table with the version (nameID 5) and the PostScript name (nameID 6).
const win = (nameID, text) => ({ platformID: 3, encodingID: 1, languageID: 0x0409, nameID, text });
const makeFont = ({ postScriptName, version }) => rawFont({ names: [win(5, version), win(6, postScriptName)] });

describe('panel font scan', () => {
  it('reads the PostScript name and version like tools/fonts/opentype-name.mjs', () => {
    const font = makeFont({ postScriptName: 'SBSansDisplay-Semibold', version: 'Version 1.002;hotconv' });
    expect(readFontNames(new Uint8Array(font))).toEqual({ postScriptName: 'SBSansDisplay-Semibold', version: 'Version 1.002;hotconv' });
    expect(() => readFontNames(new Uint8Array([1, 2, 3]))).toThrow(/too short/);
  });

  it('finds the brand faces in the font folders by the name inside the file', () => {
    const files = {
      'C:/Windows/Fonts/SBSansDisplay-SemiBold.otf': makeFont({ postScriptName: 'SBSansDisplay-Semibold', version: 'Version 1.002' }),
      'C:/Windows/Fonts/arial.ttf': makeFont({ postScriptName: 'ArialMT', version: 'Version 7.00' }),
      'C:/Windows/Fonts/SBSans-broken.otf': Buffer.from('nope'),
    };
    const fs = {
      list: (dir) => {
        if (dir !== 'C:/Windows/Fonts') throw new Error('ENOENT');
        return Object.keys(files);
      },
      read: (f) => new Uint8Array(files[f]),
    };
    const r = scanFontFolders(fs, fontDirs('win', { WINDIR: 'C:\\Windows' }), ['SBSansDisplay-Semibold', 'SBSansText-Regular']);
    expect(r).toEqual({
      'SBSansDisplay-Semibold': { found: true, version: 'Version 1.002', file: 'C:/Windows/Fonts/SBSansDisplay-SemiBold.otf' },
      'SBSansText-Regular': { found: false, version: null },
    });
  });

  it('knows the font folders of each OS', () => {
    expect(fontDirs('win', { WINDIR: 'C:\\Windows', LOCALAPPDATA: 'C:\\Users\\g\\AppData\\Local' })).toEqual([
      'C:/Windows/Fonts', 'C:/Users/g/AppData/Local/Microsoft/Windows/Fonts', 'C:/Program Files/Common Files/Adobe/Fonts',
    ]);
    expect(fontDirs('mac', { HOME: '/Users/g' })).toContain('/Users/g/Library/Fonts');
  });
});
