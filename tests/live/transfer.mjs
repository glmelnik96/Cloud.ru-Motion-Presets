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

// The verdict on the listing of the opened copy: nothing missing, and every file the panel put next to the
// project (its folders) resolved inside the copy. Files of the test bed itself next to the project (the cut clip
// of Premiere) are copied too but may resolve at their old place, which is not renamed: they are not the panel's.
export function transferVerdict(items, movedDir) {
  const marks = [...new Set(Object.values(TRANSFER_PARTS).flat())].map((p) => `/${p.toLowerCase()}/`);
  const missing = items.filter((i) => i.missing);
  const ours = items.filter((i) => i.file && marks.some((m) => norm(i.file).includes(m)));
  const outside = ours.filter((i) => !i.missing && !norm(i.file).startsWith(norm(movedDir) + '/'));
  return { missing, outside, ours: ours.length, count: items.length };
}

// Media files of the test bed lying next to the project: copied with it, so the copy opens on another machine.
const LOOSE = /\.(png|jpg|mov|mp4|wav)$/i;

// Windows keeps a folder busy for a while after the host lets the project go (checkpoint 2026-10-06: EPERM on
// «Cloud.ru BrandKit» right after the release, free a little later): a rename is retried with growing pauses.
export const RENAME_PAUSES_MS = [500, 1000, 2000, 4000, 8000, 15000];

async function renameRetry(fs, from, to, sleep, pauses = RENAME_PAUSES_MS) {
  for (let i = 0; ; i += 1) {
    try {
      fs.rename(from, to);
      return i;
    } catch (e) {
      const busy = /EPERM|EBUSY|EACCES/.test(String(e && (e.code || e.message)));
      if (!busy || i >= pauses.length) throw e;
      await sleep(pauses[i]);
    }
  }
}

// Premiere 26.5 keeps every media file it imported open until it quits — closing the project, setOffline and a
// minute of waiting change nothing (build PC, 2026-10-06, handle.exe) — so the originals cannot be moved away in
// the session that made the project. There the media run only stages the copy (o.defer gets what the check
// needs) and the check runs after a restart of Premiere: node tools/panel/live.mjs --host pr --transfer.
export const TRANSFER_DEFERRED = { ae: false, pr: true };
export const RESTART_HINT = 'Premiere держит импортированные медиа до выхода: перезапустите Premiere и запустите node tools/panel/live.mjs --host pr --transfer';

// Release the project and copy it with its folders and the loose media of the test bed to o.movedDir.
export async function stageTransfer(o) {
  const { host, hostRun, R, fs } = o;
  const parts = TRANSFER_PARTS[host].filter((p) => fs.exists(`${dirOf(o.project)}/${p}`));
  const moved = `${o.movedDir}/${leaf(o.project)}`;
  R.fromHost('transfer: release the project', await hostRun('transferRelease', {}));
  fs.reset(o.movedDir);
  fs.copy(o.project, moved);
  for (const p of parts) fs.copy(`${dirOf(o.project)}/${p}`, `${o.movedDir}/${p}`);
  for (const f of fs.files(dirOf(o.project)).filter((x) => LOOSE.test(x))) fs.copy(`${dirOf(o.project)}/${f}`, `${o.movedDir}/${f}`);
  const ok = R.check(`transfer: copied the project and ${parts.join(', ') || 'no folder'} to ${o.movedDir}`, parts.includes('Cloud.ru BrandKit'), parts);
  return ok ? { host, project: o.project, movedDir: o.movedDir, moved, parts, libraryRoot: o.libraryRoot } : null;
}

// Move the originals and the library away, open the copy, judge its listing, put everything back.
export async function checkTransfer(o, staged) {
  const { hostRun, R, fs } = o;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const away = [...staged.parts.map((p) => `${dirOf(staged.project)}/${p}`), staged.libraryRoot];
  const renamed = [];
  try {
    const lost = [staged.moved, ...staged.parts.map((p) => `${staged.movedDir}/${p}`)].filter((p) => !fs.exists(p));
    if (lost.length) throw new Error(`the staged copy is gone: ${lost.join(', ')}`);
    const retries = {};
    for (const p of away) {
      try {
        retries[p] = await renameRetry(fs, p, `${p}.away`, sleep);
      } catch (e) {
        // who holds it: handle.exe of Sysinternals when it is on PATH (o.holders), else only the error
        throw new Error(`${p}: ${String(e && e.message ? e.message : e)}${o.holders ? `; held by: ${o.holders(p)}` : ''}${staged.host === 'pr' ? `; ${RESTART_HINT}` : ''}`);
      }
      renamed.push(p);
    }
    R.check('transfer: the original folders and the library are out of the way', renamed.length === away.length, { renamed, retries });
    const r = R.fromHost('transfer: open the moved copy', await hostRun('transferOpen', { project: staged.moved }));
    const v = transferVerdict(r?.items ?? [], staged.movedDir);
    R.check(`transfer: no missing files after the move (${v.count} listed)`, r && v.count > 0 && v.missing.length === 0, v.missing);
    R.check(`transfer: every file the panel put next to the project found inside the moved copy (${v.ours})`, r && v.ours > 0 && v.outside.length === 0, v.outside);
  } catch (e) {
    R.check('transfer: finished without an exception', false, String(e && e.message ? e.message : e));
  } finally {
    for (const p of renamed.reverse()) {
      try {
        await renameRetry(fs, `${p}.away`, p, sleep);
      } catch (e) {
        R.check(`transfer: ${p} renamed back`, false, String(e && e.message ? e.message : e));
      }
    }
  }
}

export async function runTransferLive(o) {
  const staged = await stageTransfer(o);
  if (!staged) return;
  if (TRANSFER_DEFERRED[o.host] && o.defer) {
    o.defer(staged);
    o.R.check(`transfer: the check of ${staged.moved} waits for a restart of Premiere (node tools/panel/live.mjs --host pr --transfer)`, true, staged, false);
    return;
  }
  await checkTransfer(o, staged);
}
