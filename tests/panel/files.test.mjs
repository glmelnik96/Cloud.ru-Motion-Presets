// Files a T2/T3 insert puts next to the project (panel/src/services/files.ts): copies through «.part», reuse of a
// file of the same size, and the #222222 backdrop still (panel/src/services/png.ts), checked with Node's zlib.
import { inflateSync, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { prepareFiles } from '../../panel/src/services/files.ts';
import { crc32, solidPng } from '../../panel/src/services/png.ts';

const deflate = (raw) => new Uint8Array(deflateSync(raw));

function memFs(files = {}) {
  const sizes = new Map(Object.entries(files));
  const log = [];
  const fs = {
    log,
    sizes,
    size: (p) => sizes.get(p) ?? null,
    mkdirp: (d) => void log.push(`mkdir ${d}`),
    copy: async (from, to) => {
      if (fs.failCopy) throw new Error('диск заполнен');
      sizes.set(to, sizes.get(from));
      log.push(`copy ${from.split('/').pop()} -> ${to.split('/').pop()}`);
    },
    rename: (from, to) => { sizes.set(to, sizes.get(from)); sizes.delete(from); log.push(`rename ${to.split('/').pop()}`); },
    remove: (p) => { sizes.delete(p); log.push(`remove ${p.split('/').pop()}`); },
    write: (p, b) => { sizes.set(p, b.length); log.push(`write ${p.split('/').pop()}`); },
  };
  return fs;
}

describe('files next to the project', () => {
  const job = { from: 'C:/lib/items/BG_Arrows/BG_Arrows_16x9_loop_v1.mov', to: 'C:/p/Cloud.ru BrandKit/BG_Arrows@1/BG_Arrows_16x9_loop_v1.mov' };

  it('copies through .part, reuses a file of the same size, writes the backdrop still once', async () => {
    const fs = memFs({ [job.from]: 1000 });
    const solid = { path: 'C:/p/Cloud.ru BrandKit/backdrop_222222_1920x1080.png', w: 1920, h: 1080, color: [34, 34, 34] };
    const r = await prepareFiles(fs, { copies: [job], solids: [solid] }, deflate);
    expect(r).toEqual({ copied: [job.to], reused: [], written: [solid.path] });
    expect(fs.log).toEqual(['mkdir C:/p/Cloud.ru BrandKit/BG_Arrows@1', 'copy BG_Arrows_16x9_loop_v1.mov -> BG_Arrows_16x9_loop_v1.mov.part', 'rename BG_Arrows_16x9_loop_v1.mov', 'mkdir C:/p/Cloud.ru BrandKit', 'write backdrop_222222_1920x1080.png']);
    const again = await prepareFiles(fs, { copies: [job], solids: [solid] }, deflate);
    expect(again).toEqual({ copied: [], reused: [job.to, solid.path], written: [] });
  });

  it('copies again over a file of another size, and cleans up a failed copy', async () => {
    const fs = memFs({ [job.from]: 1000, [job.to]: 10 });
    await prepareFiles(fs, { copies: [job], solids: [] }, deflate);
    expect(fs.sizes.get(job.to)).toBe(1000);
    fs.sizes.set(job.to, 5);
    fs.failCopy = true;
    await expect(prepareFiles(fs, { copies: [job], solids: [] }, deflate)).rejects.toThrow(/диск заполнен/);
    expect(fs.sizes.has(`${job.to}.part`)).toBe(false);
  });

  it('refuses a library file that is not there', async () => {
    await expect(prepareFiles(memFs(), { copies: [job], solids: [] }, deflate)).rejects.toThrow(/нет файла библиотеки/);
  });

  it('writes a valid PNG of one colour', () => {
    const png = solidPng(4, 3, [0x22, 0x22, 0x22], deflate);
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([4, 3]);
    // every chunk's CRC covers its type and data
    let at = 8;
    const types = [];
    while (at < png.length) {
      const len = view.getUint32(at);
      const type = String.fromCharCode(...png.slice(at + 4, at + 8));
      types.push(type);
      expect(view.getUint32(at + 8 + len)).toBe(crc32(png, at + 4, at + 8 + len));
      if (type === 'IDAT') {
        const raw = inflateSync(png.slice(at + 8, at + 8 + len));
        expect(raw.length).toBe(3 * (1 + 4 * 3));
        expect([...raw.slice(0, 4)]).toEqual([0, 0x22, 0x22, 0x22]);
      }
      at += 12 + len;
    }
    expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
  });
});
