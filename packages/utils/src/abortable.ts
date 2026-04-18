// Abortable wrapper factories for promises and async generators.

import type { AbortableAsyncGenerator, AbortablePromise } from "./abortable.types";

/**
 * Create an `AbortablePromise` from an executor that receives an `AbortSignal`.
 *
 * An internal `AbortController` is created automatically. The returned promise
 * has an `.abort()` method that triggers cancellation on that controller.
 *
 * @example
 * ```ts
 * const pending = createAbortablePromise((signal) =>
 *   fetch("https://api.example.com/data", { signal }).then((response) => response.json()),
 * );
 * setTimeout(() => pending.abort(), 5000);
 * const data = await pending;
 * ```
 */
export function createAbortablePromise<ResultType>(
  executor: (signal: AbortSignal) => Promise<ResultType>,
): AbortablePromise<ResultType> {
  const controller = new AbortController();
  const resultPromise = executor(controller.signal);
  const abortablePromise = resultPromise as AbortablePromise<ResultType>;
  abortablePromise.abort = () => controller.abort();
  return abortablePromise;
}

/**
 * Create an `AbortableAsyncGenerator` from a generator factory that receives
 * an `AbortSignal`.
 *
 * An internal `AbortController` is created automatically. The returned generator
 * has an `.abort()` method that triggers cancellation on that controller.
 *
 * @example
 * ```ts
 * const stream = createAbortableGenerator((signal) => generateEvents(signal));
 * setTimeout(() => stream.abort(), 5000);
 * for await (const event of stream) {
 *   console.log(event);
 * }
 * ```
 */
export function createAbortableGenerator<YieldType>(
  generatorFactory: (signal: AbortSignal) => AsyncGenerator<YieldType, void, undefined>,
): AbortableAsyncGenerator<YieldType> {
  const controller = new AbortController();
  const innerGenerator = generatorFactory(controller.signal);
  const abortableGenerator = innerGenerator as AbortableAsyncGenerator<YieldType>;
  abortableGenerator.abort = () => controller.abort();
  return abortableGenerator;
}
