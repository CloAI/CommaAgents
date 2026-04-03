// User agent default constants.

import type { InputCollector, InputRequest } from "./user-agent.types";

// Default input collector — uses Bun/Node prompt (stdin)

export const defaultInputCollector: InputCollector = async (
  request: InputRequest,
): Promise<string> => {
  // In Bun, `prompt()` is a global that reads from stdin
  if (typeof globalThis.prompt === "function") {
    return globalThis.prompt(request.prompt) ?? "";
  }

  // Fallback: use Node.js readline
  const { createInterface } = await import("node:readline");
  const readlineInterface = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve, reject) => {
    // Support cancellation via AbortSignal
    if (request.signal?.aborted) {
      readlineInterface.close();
      reject(new DOMException("Input collection aborted", "AbortError"));
      return;
    }

    const onAbort = (): void => {
      readlineInterface.close();
      reject(new DOMException("Input collection aborted", "AbortError"));
    };

    request.signal?.addEventListener("abort", onAbort, { once: true });

    readlineInterface.question(`${request.prompt}\n> `, (answer) => {
      request.signal?.removeEventListener("abort", onAbort);
      readlineInterface.close();
      resolve(answer);
    });
  });
};
