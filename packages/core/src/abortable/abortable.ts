import type {
  AbortableAsyncGenerator,
  AbortablePromise,
} from "./abortable.types";

/** Create a cancellable promise backed by an `AbortController`. */
export function createAbortablePromise<ResultType>(
  executor: (signal: AbortSignal) => Promise<ResultType>,
): AbortablePromise<ResultType> {
  const controller = new AbortController();
  const abortablePromise = executor(
    controller.signal,
  ) as AbortablePromise<ResultType>;
  abortablePromise.abort = () => controller.abort();
  return abortablePromise;
}

/** Create a cancellable async generator backed by an `AbortController`. */
export function createAbortableGenerator<YieldType>(
  generatorFactory: (
    signal: AbortSignal,
  ) => AsyncGenerator<YieldType, void, undefined>,
): AbortableAsyncGenerator<YieldType> {
  const controller = new AbortController();
  const abortableGenerator = generatorFactory(
    controller.signal,
  ) as AbortableAsyncGenerator<YieldType>;
  abortableGenerator.abort = () => controller.abort();
  return abortableGenerator;
}
