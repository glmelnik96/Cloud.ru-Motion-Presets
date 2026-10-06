// Node side of «Экспорт»: aerender for the background render of AE (decision P20) and «Показать в папке»
// (P23). The process is injected, so tests run it on a fake.
import { basename, dirname, type Platform } from '../core/paths';

export interface AerenderJob {
  exe: string;
  project: string;
  rqIndex: number;
}

export interface AerenderResult {
  ok: boolean;
  code: number | null;
  // The last lines aerender printed, for the log and the message.
  tail: string[];
}

export interface ChildLike {
  stdout?: { on(ev: 'data', fn: (b: unknown) => void): void } | null;
  stderr?: { on(ev: 'data', fn: (b: unknown) => void): void } | null;
  on(ev: 'close', fn: (code: number | null) => void): void;
  on(ev: 'error', fn: (e: Error) => void): void;
}

export type Spawn = (cmd: string, args: string[], opts: Record<string, unknown>) => ChildLike;

export const native = (platform: Platform, p: string): string => (platform === 'win' ? p.replace(/\//g, '\\') : p);

// aerender renders item rqIndex of the saved project with its own settings: template, Resize, frame rate,
// work area and file, as the adapter queued them.
export function aerenderArgs(platform: Platform, job: AerenderJob): string[] {
  return ['-project', native(platform, job.project), '-rqindex', String(job.rqIndex)];
}

const TAIL = 20;

export function runAerender(spawn: Spawn, platform: Platform, job: AerenderJob): Promise<AerenderResult> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    let rest = '';
    const take = (b: unknown) => {
      const text = rest + String(b);
      const parts = text.split(/\r?\n/);
      rest = parts.pop() ?? '';
      for (const l of parts) if (l.trim()) lines.push(l.trim());
      if (lines.length > TAIL) lines.splice(0, lines.length - TAIL);
    };
    let child: ChildLike;
    try {
      child = spawn(native(platform, job.exe), aerenderArgs(platform, job), { windowsHide: true });
    } catch (e) {
      resolve({ ok: false, code: null, tail: [String((e as Error)?.message ?? e)] });
      return;
    }
    let done = false;
    const finish = (r: AerenderResult) => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    child.stdout?.on('data', take);
    child.stderr?.on('data', take);
    child.on('error', (e) => finish({ ok: false, code: null, tail: [...lines, String(e.message)] }));
    child.on('close', (code) => {
      if (rest.trim()) lines.push(rest.trim());
      const tail = lines.slice(-TAIL);
      // aerender may exit 0 after an error of its own: «aerender ERROR» in the output says so.
      finish({ ok: code === 0 && !tail.some((l) => /aerender ERROR|^ERROR:/i.test(l)), code, tail });
    });
  });
}

// Explorer or Finder with the file selected, or its folder while the file is not there yet (the AME queue).
export function revealCommand(platform: Platform, path: string, fileExists: boolean): { cmd: string; args: string[] } {
  if (platform === 'win') {
    return fileExists ? { cmd: 'explorer.exe', args: [`/select,${native(platform, path)}`] } : { cmd: 'explorer.exe', args: [native(platform, dirname(path))] };
  }
  return fileExists ? { cmd: 'open', args: ['-R', path] } : { cmd: 'open', args: [dirname(path)] };
}

// The message of a failed background render: the last line that says something.
export function aerenderProblem(r: AerenderResult, output: string): string {
  const line = [...r.tail].reverse().find((l) => /error|ошибк/i.test(l)) ?? r.tail[r.tail.length - 1];
  return line ? `${basename(output)}: ${line}` : `${basename(output)}: aerender завершился с кодом ${r.code}`;
}
