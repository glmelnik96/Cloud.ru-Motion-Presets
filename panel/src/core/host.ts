// The contract between the core and a host: one entry point, replies {ok, data, error} (spec 6 «Мост»).
// The bridge (panel/src/bridge/bridge.ts) implements it over CSInterface.evalScript; tests use fakes.

export interface HostError {
  code: string;
  message: string;
}

export interface HostReply<T = unknown> {
  ok: boolean;
  data?: T;
  error?: HostError;
}

export interface CallOptions {
  // A call that changes the project. It is never repeated: after a timeout the state is read instead.
  mutating?: boolean;
  timeoutMs?: number;
}

export interface HostCaller {
  call<T = unknown>(fn: string, args?: unknown, opts?: CallOptions): Promise<HostReply<T>>;
}

// Error codes the adapters raise with BK.fail (panel/host/common.jsx).
export const HOST_CODES = ['NO_TARGET', 'NOT_SAVED', 'INSERT_FAILED', 'TEMPLATE_BROKEN', 'NO_FILE', 'BAD_ARGS', 'NO_FUNCTION', 'HOST_EXCEPTION', 'TIMEOUT', 'BRIDGE'] as const;
