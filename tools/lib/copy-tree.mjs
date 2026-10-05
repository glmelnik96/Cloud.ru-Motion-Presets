// Recursive copy by hand: fs.cpSync({ recursive: true }) crashed Node 24 on Windows with 0xC0000409 while
// copying panel/dist (preview check 2026-10-05). filter(src) === false skips a file or a folder.
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export function copyTree(src, dst, { filter = () => true } = {}) {
  let files = 0;
  const walk = (from, to) => {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
      const s = path.join(from, name);
      if (!filter(s)) continue;
      const d = path.join(to, name);
      if (statSync(s).isDirectory()) walk(s, d);
      else {
        copyFileSync(s, d);
        files += 1;
      }
    }
  };
  walk(src, dst);
  return files;
}
