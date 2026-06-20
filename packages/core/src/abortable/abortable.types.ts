/** A promise that can be cancelled by calling `.abort()`. */
export interface AbortablePromise<ResultType> extends Promise<ResultType> {
  /** Cancel the in-flight operation. */
  abort(): void;
}

/** An async generator that can be cancelled by calling `.abort()`. */
export interface AbortableAsyncGenerator<YieldType>
  extends AsyncGenerator<YieldType, void, undefined> {
  /** Cancel the in-flight stream. */
  abort(): void;
}
