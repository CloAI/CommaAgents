import type { ChildProcessWithoutNullStreams } from "node:child_process";

/** @internal Correlated subprocess response waiting for completion. */
export interface PendingProtocolRequest {
  readonly resolve: (body: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly cleanup: () => void;
}

/** @internal TypeScript protocol transport and its owned subprocess. */
export interface TypeScriptTransport {
  readonly child: ChildProcessWithoutNullStreams;
  request<Body>(
    command: string,
    argumentsValue: unknown,
    signal?: AbortSignal,
  ): Promise<Body>;
  close(): Promise<void>;
}

/** @internal Process settings and unexpected-exit handler. */
export interface CreateTypeScriptTransportOptions {
  readonly cwd: string;
  readonly onFailure: (error: Error) => void;
}
