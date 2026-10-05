// Local log (spec 8.2): JSON lines per day, kept for 7 days and 5 MB in all; no external telemetry.
// The file system is injected: Node fs in CEP, an in-memory fake in tests.
import { joinPath } from './paths';

export interface LogFs {
  mkdirp(dir: string): void;
  append(file: string, text: string): void;
  list(dir: string): Array<{ name: string; bytes: number }>;
  remove(file: string): void;
}

export type Level = 'info' | 'warn' | 'error';

export interface LogLimits {
  days: number;
  bytes: number;
}

const FILE = /^brandkit-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.jsonl$/;

const day = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export class Logger {
  private rotated = '';

  constructor(
    private readonly fs: LogFs,
    private readonly dir: string,
    private readonly now: () => Date = () => new Date(),
    private readonly limits: LogLimits = { days: 7, bytes: 5 * 1024 * 1024 },
  ) {}

  // The file of today; a day past a fifth of the budget continues in .1, .2 ...
  private current(files: Array<{ name: string; bytes: number }>): string {
    const today = day(this.now());
    const mine = files
      .map((f) => ({ f, m: FILE.exec(f.name) }))
      .filter((x) => x.m && x.m[1] === today)
      .map((x) => ({ n: Number(x.m![2] ?? 0), bytes: x.f.bytes }))
      .sort((a, b) => a.n - b.n);
    const last = mine[mine.length - 1];
    let n = last ? last.n : 0;
    if (last && last.bytes >= this.limits.bytes / 5) n += 1;
    return `brandkit-${today}${n ? '.' + n : ''}.jsonl`;
  }

  // Removes files older than `days` and, oldest first, whatever is over the byte budget.
  rotate(): void {
    let files: Array<{ name: string; bytes: number; date: string; n: number }>;
    try {
      files = this.fs.list(this.dir)
        .map((f) => ({ f, m: FILE.exec(f.name) }))
        .filter((x) => x.m)
        .map((x) => ({ ...x.f, date: x.m![1], n: Number(x.m![2] ?? 0) }));
    } catch {
      return;
    }
    const cutoff = new Date(this.now().getTime() - this.limits.days * 86400000);
    const oldest = day(cutoff);
    files.sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n);
    let total = files.reduce((s, f) => s + f.bytes, 0);
    for (const f of files) {
      const old = f.date <= oldest;
      if (old || total > this.limits.bytes) {
        try {
          this.fs.remove(joinPath(this.dir, f.name));
          total -= f.bytes;
        } catch {
          // a file another panel instance holds open stays until the next rotation
        }
      }
    }
  }

  log(level: Level, event: string, data: Record<string, unknown> = {}): void {
    try {
      const today = day(this.now());
      if (this.rotated !== today) {
        this.fs.mkdirp(this.dir);
        this.rotate();
        this.rotated = today;
      }
      const line = JSON.stringify({ t: this.now().toISOString(), level, event, ...data });
      this.fs.append(joinPath(this.dir, this.current(this.fs.list(this.dir))), line + '\n');
    } catch {
      // logging never breaks an insert
    }
  }

  info(event: string, data?: Record<string, unknown>): void {
    this.log('info', event, data);
  }

  warn(event: string, data?: Record<string, unknown>): void {
    this.log('warn', event, data);
  }

  error(event: string, data?: Record<string, unknown>): void {
    this.log('error', event, data);
  }
}
