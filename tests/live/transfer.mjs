// Live check of the portability of a project with inserts (spec 3, phase 3: «проект со вставками из AE и
// Premiere открывается на другой ОС без пропавших файлов»; 6.1 «Переносимость»). After the media inserts the
// scratch project and the folders it keeps next to it are copied elsewhere; the originals of those folders and
// the library itself are renamed away for the moment, so no absolute path can resolve; the copy is opened in
// the host and every footage file must be found inside the copy. On Windows this stands in for another
// machine; the same open runs on the Mac with a project made on Windows (tests/live/transfer.live.mjs).
// tests/panel/transfer-live.test.mjs runs it dry.

// What the project keeps next to itself: the copies of the panel (P11) and, in Premiere, the MOGRT media.
export const TRANSFER_PARTS = { ae: ['Cloud.ru BrandKit'], pr: ['Cloud.ru BrandKit', 'Motion Graphics Template Media'] };

const norm = (p) => String(p ?? '').replace(/\\/g, '/').toLowerCase();
const leaf = (p) => String(p).replace(/\\/g, '/').split('/').pop();
const dirOf = (p) => String(p).replace(/\\/g, '/').replace(/\/[^/]*$/, '');

// The verdict on the listing of the opened copy: nothing missing, and every file resolved inside the copy.
export function transferVerdict(items, movedDir) {
  const missing = items.filter((i) => i.missing);
  const outside = items.filter((i) => !i.missing && i.file && !norm(i.file).startsWith(norm(movedDir) + '/'));
  return { missing, outside, count: items.length };
}

export async function runTransferLive(o) {
  const { host, hostRun, R, fs } = o;
  const parts = TRANSFER_PARTS[host].filter((p) => fs.exists(`${dirOf(o.project)}/${p}`));
  const moved = `${o.movedDir}/${leaf(o.project)}`;
  R.fromHost('transfer: release the project', await hostRun('transferRelease', {}));
  fs.reset(o.movedDir);
  fs.copy(o.project, moved);
  for (const p of parts) fs.copy(`${dirOf(o.project)}/${p}`, `${o.movedDir}/${p}`);
  R.check(`transfer: copied the project and ${parts.join(', ') || 'no folder'} to ${o.movedDir}`, parts.includes('Cloud.ru BrandKit'), parts);
  const away = [...parts.map((p) => `${dirOf(o.project)}/${p}`), o.libraryRoot];
  const renamed = [];
  try {
    for (const p of away) {
      fs.rename(p, `${p}.away`);
      renamed.push(p);
    }
    R.check('transfer: the original folders and the library are out of the way', renamed.length === away.length, renamed);
    const r = R.fromHost('transfer: open the moved copy', await hostRun('transferOpen', { project: moved }));
    const v = transferVerdict(r?.items ?? [], o.movedDir);
    R.check(`transfer: no missing files after the move (${v.count} listed)`, r && v.count > 0 && v.missing.length === 0, v.missing);
    R.check('transfer: every file found inside the moved copy', r && v.outside.length === 0, v.outside);
  } catch (e) {
    R.check('transfer: finished without an exception', false, String(e && e.message ? e.message : e));
  } finally {
    for (const p of renamed.reverse()) {
      try {
        fs.rename(`${p}.away`, p);
      } catch (e) {
        R.check(`transfer: ${p} renamed back`, false, String(e && e.message ? e.message : e));
      }
    }
  }
}
