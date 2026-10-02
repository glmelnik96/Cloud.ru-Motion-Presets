// Opening and closing our working copies in the live AE without ever losing the user's work.
import { callJsx } from './jsx-call.mjs';
import { crbkRoot } from './paths.mjs';

// AE opens an older-version project as "<name> (converted).aep" next to the original file.
export function sameProjectFile(actual, expected) {
  if (!actual || !expected) return false;
  const norm = (p) => String(p).replace(/\\/g, '/').normalize('NFC').toLowerCase()
    .replace(/ \(converted\)(\.aepx?)$/, '$1');
  return norm(actual) === norm(expected);
}

// What AE has open right after app.open(file): the file itself, or, for a project saved by an older
// AE version, an untitled converted project. AE 26.5 keeps it untitled until it is saved (seen live
// 2026-10-02), so it is accepted only with a fingerprint that later calls check before any change.
export function acceptOpened(r, file) {
  if (sameProjectFile(r.file, file)) return { converted: false };
  const fp = r.fingerprint;
  if (!r.file && r.converted === true && fp && fp.items > 0) return { converted: true, fingerprint: fp };
  throw new Error('OPEN_MISMATCH: AE reports "' + r.file + '" for ' + file);
}

export function projectState() {
  return callJsx(['tools/packs/jsx/project-state.jsx'], {}, { timeoutMs: 30000 });
}

// Opens `file` unless it is already the open project (then it is reused even with unsaved changes:
// it is our own working copy). Any OTHER project with unsaved changes stops the run.
export async function openProject(file, { timeoutMs = 300000 } = {}) {
  const st = await projectState();
  if (sameProjectFile(st.file, file)) return { opened: false, file: st.file, dirty: st.dirty, version: st.version };
  if (st.dirty) {
    const ours = st.file && String(st.file).replace(/\\/g, '/').toLowerCase().startsWith(crbkRoot().toLowerCase() + '/');
    throw new Error('AE_DIRTY: "' + (st.file || 'untitled') + '" has unsaved changes. ' + (ours
      ? 'It is a BrandKit working copy: close it in AE WITHOUT saving (File > Close > Don\'t Save), then run the command again'
      : 'Save or close it in AE, then run the command again'));
  }
  try {
    const r = await callJsx(['tools/packs/jsx/open-project.jsx'], { path: file }, { timeoutMs });
    const how = acceptOpened(r, file);
    return { opened: true, file: r.file, dirty: r.dirty, version: st.version, ...how };
  } catch (e) {
    if (/CDP_TIMEOUT/.test(e.message)) {
      e.message += '\nAE is probably showing a dialog (missing files or fonts). Read it, press OK in AE, ' +
        'then run the same command again: it continues with the project that is now open.';
    }
    throw e;
  }
}

export function closeDiscard(file) {
  return callJsx(['tools/packs/jsx/close-project.jsx'], { expect: file }, { timeoutMs: 60000 });
}
