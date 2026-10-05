// Structured log entries {ts, level, code, msg, data} (spec 8.2: the user reads Russian, the log keeps the code).
// The core only builds entries; the injected sink stores them (services/logsink writes JSONL by day).

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string; // ISO 8601, UTC
  level: LogLevel;
  code: string;
  msg: string;
  data?: unknown;
}

export type LogSink = (entry: LogEntry) => void;

export interface Logger {
  info(code: string, msg: string, data?: unknown): void;
  warn(code: string, msg: string, data?: unknown): void;
  error(code: string, msg: string, data?: unknown): void;
}

export function createLogger(sink: LogSink, now: () => Date = () => new Date()): Logger {
  const write = (level: LogLevel) => (code: string, msg: string, data?: unknown) => {
    // Logging must never break an insert: a full disk or a bad clock only loses the line (or its time).
    let ts = '';
    try {
      ts = now().toISOString();
    } catch {
      // keep the entry without a time
    }
    const entry: LogEntry = { ts, level, code, msg };
    if (data !== undefined) entry.data = data;
    try {
      sink(entry);
    } catch {
      // the sink failed; nothing else to tell
    }
  };
  return { info: write('info'), warn: write('warn'), error: write('error') };
}
