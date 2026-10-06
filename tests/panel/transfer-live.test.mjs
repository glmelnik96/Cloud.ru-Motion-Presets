// A dry run of the portability check (tests/live/transfer.mjs): an in-memory disk, the host answering with the
// listing of the opened copy. What the check catches: a file missing, a file found at its old place.
import { describe, expect, it } from 'vitest';
import { runTransferLive, transferVerdict } from '../live/transfer.mjs';
import { Report } from '../live/runner.mjs';

const W = 'C:/CRBK/work/panel-live';

function disk(paths) {
  const set = new Set(paths);
  const log = [];
  const under = (p) => [...set].filter((x) => x === p || x.startsWith(p + '/'));
  return {
    set, log,
    exists: (p) => under(p).length > 0,
    files: (d) => [...set].filter((x) => x.startsWith(d + '/') && !x.slice(d.length + 1).includes('/')).map((x) => x.slice(d.length + 1)),
    reset: (d) => { for (const x of under(d)) set.delete(x); log.push(`reset ${d}`); },
    copy: (from, to) => { for (const x of under(from)) set.add(to + x.slice(from.length)); log.push(`copy ${from} -> ${to}`); },
    rename: (from, to) => {
      const xs = under(from);
      if (!xs.length) throw new Error(`ENOENT ${from}`);
      for (const x of xs) { set.delete(x); set.add(to + x.slice(from.length)); }
      log.push(`rename ${from} -> ${to}`);
    },
  };
}

const ok = (data) => ({ checks: [{ name: 'step', pass: true }], data });

describe('transfer check, dry', () => {
  const files = [`${W}/pr/media_live.prproj`, `${W}/pr/cut-clip.png`, `${W}/pr/pr-report.txt`, `${W}/pr/Cloud.ru BrandKit/BG_Arrows@1/BG_Arrows_16x9_loop_v1.mov`, `${W}/pr/Motion Graphics Template Media/x/TTL.aegraphic`, `${W}/media/library/library.json`];

  it('copies the project and its folders, moves the originals and the library away, and puts them back', async () => {
    const fs = disk(files);
    const R = new Report('pr');
    let seen = null;
    const hostRun = async (op, p) => {
      if (op === 'transferOpen') {
        seen = [...fs.set].sort();
        // the cut clip of the test bed resolves at its old place, which is allowed
        return ok({ path: p.project, items: [{ name: 'loop', file: `${W}/pr-moved/Cloud.ru BrandKit/BG_Arrows@1/BG_Arrows_16x9_loop_v1.mov`, missing: false }, { name: 'cut', file: `${W}/pr/cut-clip.png`, missing: false }] });
      }
      return ok({});
    };
    await runTransferLive({ host: 'pr', hostRun, R, fs, project: `${W}/pr/media_live.prproj`, movedDir: `${W}/pr-moved`, libraryRoot: `${W}/media/library` });
    expect(R.failed()).toEqual([]);
    // while the copy was open, nothing but the copy could resolve
    expect(seen.filter((p) => p.startsWith(`${W}/pr/Cloud.ru BrandKit/`) || p.startsWith(`${W}/media/library/`))).toEqual([]);
    expect(seen).toContain(`${W}/pr-moved/Motion Graphics Template Media/x/TTL.aegraphic`);
    // the loose media of the test bed travels with the copy, its other files do not
    expect([...fs.set].sort()).toEqual([...files, `${W}/pr-moved/media_live.prproj`, `${W}/pr-moved/cut-clip.png`, `${W}/pr-moved/Cloud.ru BrandKit/BG_Arrows@1/BG_Arrows_16x9_loop_v1.mov`, `${W}/pr-moved/Motion Graphics Template Media/x/TTL.aegraphic`].sort());
  });

  it('a missing file or one found at its old place fails the check', () => {
    expect(transferVerdict([{ name: 'a', file: 'C:/x/a.mov', missing: true }], 'C:/m').missing).toHaveLength(1);
    expect(transferVerdict([{ name: 'b', file: 'C:/CRBK/work/panel-live/pr/Cloud.ru BrandKit/b.mov', missing: false }], 'C:/CRBK/work/panel-live/pr-moved').outside).toHaveLength(1);
    expect(transferVerdict([{ name: 'c', file: 'C:\\CRBK\\work\\panel-live\\pr-moved\\Cloud.ru BrandKit\\c.mov', missing: false }], 'C:/CRBK/work/panel-live/pr-moved')).toMatchObject({ outside: [], ours: 1 });
    // a file of the test bed at its old place is not the panel's
    expect(transferVerdict([{ name: 'cut', file: 'C:/CRBK/work/panel-live/pr/cut-clip.png', missing: false }], 'C:/CRBK/work/panel-live/pr-moved')).toMatchObject({ outside: [], ours: 0 });
  });

  it('a folder still busy after the release is renamed once it is free', async () => {
    const fs = disk(files);
    const real = fs.rename;
    let busy = 2;
    fs.rename = (from, to) => {
      if (from.endsWith('/Cloud.ru BrandKit') && busy > 0) {
        busy -= 1;
        const e = new Error(`EPERM: operation not permitted, rename '${from}'`);
        e.code = 'EPERM';
        throw e;
      }
      real(from, to);
    };
    const slept = [];
    const R = new Report('pr');
    await runTransferLive({ host: 'pr', hostRun: async (op, p) => ok(op === 'transferOpen' ? { items: [{ name: 'l', file: `${W}/pr-moved/Cloud.ru BrandKit/x.mov`, missing: false }] } : {}), R, fs, sleep: async (ms) => void slept.push(ms),
      project: `${W}/pr/media_live.prproj`, movedDir: `${W}/pr-moved`, libraryRoot: `${W}/media/library` });
    expect(R.failed()).toEqual([]);
    expect(slept).toEqual([500, 1000]);
    expect(R.checks.find((c) => /out of the way/.test(c.name)).detail.retries[`${W}/pr/Cloud.ru BrandKit`]).toBe(2);
  });

  it('a folder that stays busy names who holds it', async () => {
    const fs = disk(files);
    fs.rename = (from) => { const e = new Error(`EPERM ${from}`); e.code = 'EPERM'; throw e; };
    const R = new Report('pr');
    await runTransferLive({ host: 'pr', hostRun: async () => ok({}), R, fs, sleep: async () => undefined, holders: () => 'Adobe Premiere Pro.exe pid: 4242',
      project: `${W}/pr/media_live.prproj`, movedDir: `${W}/pr-moved`, libraryRoot: `${W}/media/library` });
    expect(R.checks.find((c) => c.name === 'transfer: finished without an exception').detail).toMatch(/held by: Adobe Premiere Pro\.exe pid: 4242/);
  });

  it('a rename that fails is reported and the rest is put back', async () => {
    const fs = disk(files.filter((f) => !f.includes('/media/library/')));
    const R = new Report('ae');
    await runTransferLive({ host: 'pr', hostRun: async () => ok({ items: [] }), R, fs, project: `${W}/pr/media_live.prproj`, movedDir: `${W}/pr-moved`, libraryRoot: `${W}/media/library` });
    expect(R.failed()).toEqual(['transfer: finished without an exception']);
    expect(fs.exists(`${W}/pr/Cloud.ru BrandKit`)).toBe(true);
  });
});
