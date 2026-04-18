// Abortable wrapper types for promises and async generators.

/**
 * A promise that can be cancelled by calling `.abort()`.
 *
 * Internally backed by an `AbortController` whose signal is passed to the
 * underlying operation. Calling `.abort()` triggers cancellation on that
 * controller, rejecting the promise with an `AbortError`.
 *
 * @example
 * ```ts
 * const pending = createAbortablePromise((signal) => fetch(url, { signal }));
 * setTimeout(() => pending.abort(), 2000);
 * try {
 *   const result = await pending;
 * } catch (error) {
 *   // AbortError if abort() was called before completion
 * }
 * ```
 */
export interface AbortablePromise<ResultType> extends Promise<ResultType> {
  /** Cancel the in-flight operation. */
  abort(): void;
}

/**
 * An async generator that can be cancelled by calling `.abort()`.
 *
 * Internally backed by an `AbortController` whose signal is passed to the
 * underlying stream. Calling `.abort()` cancels the in-flight stream.
 *
 * @example
 * ```ts
 * const stream = createAbortableGenerator((signal) => generateEvents(signal));
 * setTimeout(() => stream.abort(), 2000);
 * try {
 *   for await (const event of stream) { ... }
 * } catch (error) {
 *   // AbortError if abort() was called before completion
 * }
 * ```
 */
export interface AbortableAsyncGenerator<YieldType>
  extends AsyncGenerator<YieldType, void, undefined> {
  /** Cancel the in-flight stream. */
  abort(): void;
}
