import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type {
  CreateTypeScriptTransportOptions,
  PendingProtocolRequest,
  TypeScriptTransport,
} from "./transport.types";

/**
 * Spawn one TypeScript server and correlate its framed responses.
 * @param {CreateTypeScriptTransportOptions} options - Working directory and crash callback.
 * @returns {TypeScriptTransport} Owned subprocess transport.
 * @internal
 */
export function createTypeScriptTransport({
  cwd,
  onFailure,
}: CreateTypeScriptTransportOptions): TypeScriptTransport {
  const serverPath = createRequire(import.meta.url).resolve(
    "typescript/lib/tsserver.js",
  );
  const child = spawn(
    process.execPath,
    [serverPath, "--disableAutomaticTypingAcquisition"],
    {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TSS_LOG: "", TSS_TRACE: "" },
    },
  );
  const pending = new Map<number, PendingProtocolRequest>();
  let sequence = 0;
  let buffer = Buffer.alloc(0);
  let expectedExit = false;
  let failure: Error | undefined;
  let closing: Promise<void> | undefined;
  let resolveExit: () => void = () => {};
  const exited = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  function fail(error: Error): void {
    if (failure) {
      return;
    }
    failure = error;
    for (const request of pending.values()) {
      request.cleanup();
      request.reject(error);
    }
    pending.clear();
    if (!expectedExit) {
      onFailure(error);
    }
  }

  child.stderr.resume();
  child.on("error", (error) => {
    fail(error);
    resolveExit();
  });
  child.on("exit", (code, signal) => {
    fail(
      new Error(
        `TypeScript subprocess exited (${signal ?? code ?? "unknown"})`,
      ),
    );
    resolveExit();
  });
  child.stdin.on("error", fail);
  child.stdout.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    try {
      while (true) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd < 0) {
          break;
        }
        const length = /Content-Length:\s*(\d+)/i.exec(
          buffer.subarray(0, headerEnd).toString("ascii"),
        );
        if (!length) {
          throw new Error("Invalid TypeScript response frame");
        }
        const bodyLength = Number(length[1]);
        if (bodyLength > 64 * 1024 * 1024) {
          throw new Error("TypeScript response exceeds the frame limit");
        }
        const bodyEnd = headerEnd + 4 + bodyLength;
        if (buffer.length < bodyEnd) {
          break;
        }
        const message: unknown = JSON.parse(
          buffer.subarray(headerEnd + 4, bodyEnd).toString("utf8"),
        );
        buffer = buffer.subarray(bodyEnd);
        if (
          !message ||
          typeof message !== "object" ||
          !("type" in message) ||
          message.type !== "response"
        ) {
          continue;
        }
        if (
          !("request_seq" in message) ||
          typeof message.request_seq !== "number"
        ) {
          throw new Error("Invalid TypeScript response identifier");
        }
        const request = pending.get(message.request_seq);
        if (!request) {
          continue;
        }
        pending.delete(message.request_seq);
        request.cleanup();
        if ("success" in message && message.success === false) {
          const description =
            "message" in message
              ? String(message.message)
              : "TypeScript request failed";
          if (description === "No content available.") {
            request.resolve(undefined);
          } else {
            request.reject(new Error(description));
          }
        } else {
          request.resolve("body" in message ? message.body : undefined);
        }
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
      child.kill();
    }
  });

  return {
    child,
    request<Body>(
      command: string,
      argumentsValue: unknown,
      signal?: AbortSignal,
    ): Promise<Body> {
      if (signal?.aborted) {
        return Promise.reject(
          new DOMException("LSP request aborted", "AbortError"),
        );
      }
      if (failure || expectedExit) {
        return Promise.reject(
          failure ?? new Error("TypeScript subprocess is closing"),
        );
      }
      const requestId = ++sequence;
      return new Promise<Body>((resolve, reject) => {
        const abort = (): void => {
          const request = pending.get(requestId);
          pending.delete(requestId);
          request?.cleanup();
          reject(new DOMException("LSP request aborted", "AbortError"));
        };
        const timeout = setTimeout(() => {
          fail(new Error(`TypeScript request timed out: ${command}`));
          child.kill();
        }, 30_000);
        const cleanup = (): void => {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", abort);
        };
        // Body is the command-specific protocol payload; validation/conversion lives in the adapter.
        pending.set(requestId, {
          resolve: (body) => resolve(body as Body),
          reject,
          cleanup,
        });
        signal?.addEventListener("abort", abort, { once: true });
        child.stdin.write(
          `${JSON.stringify({ seq: requestId, type: "request", command, arguments: argumentsValue })}\n`,
          (error) => {
            if (error) {
              fail(error);
            }
          },
        );
      });
    },
    close(): Promise<void> {
      closing ??= (async () => {
        expectedExit = true;
        fail(new Error("TypeScript subprocess stopped"));
        child.stdin.end();
        child.kill();
        const forceKill = setTimeout(() => child.kill("SIGKILL"), 1000);
        try {
          await exited;
        } finally {
          clearTimeout(forceKill);
        }
      })();
      return closing;
    },
  };
}
