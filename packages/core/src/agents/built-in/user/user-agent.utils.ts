// User agent default constants.

import type { InputCollector, InputRequest } from "./user-agent.types";

// Default input collector — reads from stdin.

export const defaultInputCollector: InputCollector = async (
  request: InputRequest,
): Promise<string> => {
  const prompt = (
    globalThis as typeof globalThis & {
      prompt?: (message: string) => string | null;
    }
  ).prompt;
  if (typeof prompt === "function") {
    return prompt(request.prompt) ?? "";
  }

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
