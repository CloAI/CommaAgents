// ExperimentProvider — owns all rlprompter application state: the experiment
// store, the active experiment + its base strategy, the queued prompt
// overrides, and the live run state streamed from the engine's run-harness.

import { dirname } from "node:path";
import {
  loadStrategy,
  type Strategy,
  type TimelineEvent,
} from "@comma-agents/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type CreateExperimentInput,
  createExperimentStore,
  type Experiment,
  type ExperimentOverview,
  type ExperimentStore,
  type IterationFeedback,
  type PromptOverride,
  runIteration,
} from "../../engine";
import type {
  ExperimentContextValue,
  LiveRunState,
} from "./useExperiment.types";

const IDLE_LIVE: LiveRunState = {
  running: false,
  text: "",
  events: [],
  error: null,
};

const ExperimentContext = createContext<ExperimentContextValue | null>(null);

export function ExperimentProvider({
  rootDir,
  children,
}: {
  readonly rootDir?: string;
  readonly children: ReactNode;
}) {
  const storeRef = useRef<ExperimentStore>(
    createExperimentStore(rootDir !== undefined ? { rootDir } : {}),
  );
  const store = storeRef.current;

  const [experiments, setExperiments] = useState<readonly ExperimentOverview[]>(
    [],
  );
  const [active, setActive] = useState<Experiment | null>(null);
  const [baseStrategy, setBaseStrategy] = useState<Strategy | null>(null);
  const [queuedOverrides, setQueuedOverrides] = useState<
    readonly PromptOverride[]
  >([]);
  const [live, setLive] = useState<LiveRunState>(IDLE_LIVE);
  const [selectedIterationId, setSelectedIterationId] = useState<string | null>(
    null,
  );
  const [compareSelection, setCompareSelection] = useState<readonly string[]>(
    [],
  );

  const refresh = useCallback(async () => {
    setExperiments(await store.list());
  }, [store]);

  const openExperiment = useCallback(
    async (id: string) => {
      const experiment = await store.load(id);
      setActive(experiment);
      setQueuedOverrides([]);
      setLive(IDLE_LIVE);
      setSelectedIterationId(experiment.iterations.at(-1)?.id ?? null);
      setCompareSelection([]);
      const loaded = await loadStrategy(experiment.strategyPath);
      setBaseStrategy(loaded.raw);
    },
    [store],
  );

  const createExperiment = useCallback(
    async (input: CreateExperimentInput) => {
      const created = await store.create(input);
      await refresh();
      await openExperiment(created.id);
    },
    [store, refresh, openExperiment],
  );

  const closeExperiment = useCallback(() => {
    setActive(null);
    setBaseStrategy(null);
    setQueuedOverrides([]);
    setLive(IDLE_LIVE);
    setSelectedIterationId(null);
    setCompareSelection([]);
  }, []);

  const queueOverride = useCallback((override: PromptOverride) => {
    setQueuedOverrides((current) => [...current, override]);
  }, []);

  const removeQueuedOverride = useCallback((index: number) => {
    setQueuedOverrides((current) => current.filter((_, i) => i !== index));
  }, []);

  const clearQueue = useCallback(() => setQueuedOverrides([]), []);

  const runNextIteration = useCallback(
    async (input: string) => {
      if (!active || !baseStrategy) return;
      setLive({ running: true, text: "", events: [], error: null });

      try {
        const result = await runIteration({
          strategy: baseStrategy,
          overrides: queuedOverrides,
          input,
          strategyDir: dirname(active.strategyPath),
          ...(active.seedDir !== undefined ? { seedDir: active.seedDir } : {}),
          ...(active.modelOverride !== undefined
            ? { modelOverride: active.modelOverride }
            : {}),
          onEvent: (event: TimelineEvent) => {
            setLive((current) => ({
              ...current,
              events: [...current.events, event],
            }));
          },
          onStreamEvent: ({ event }) => {
            if (event.type === "text") {
              setLive((current) => ({
                ...current,
                text: current.text + event.text,
              }));
            }
          },
        });

        const iteration = await store.appendIteration(active.id, {
          input,
          overrides: queuedOverrides,
          result,
        });

        setQueuedOverrides([]);
        setActive(await store.load(active.id));
        setSelectedIterationId(iteration.id);
        setLive({
          running: false,
          text: result.result.text,
          events: result.events,
          error:
            result.status === "error" ? (result.error?.message ?? null) : null,
        });
        await refresh();
      } catch (caught) {
        setLive({
          running: false,
          text: "",
          events: [],
          error: caught instanceof Error ? caught.message : String(caught),
        });
      }
    },
    [active, baseStrategy, queuedOverrides, store, refresh],
  );

  const submitFeedback = useCallback(
    async (iterationId: string, feedback: IterationFeedback) => {
      if (!active) return;
      await store.setIterationFeedback(active.id, iterationId, feedback);
      setActive(await store.load(active.id));
    },
    [active, store],
  );

  const getIterationEvents = useCallback(
    (iterationId: string) => {
      if (!active) return Promise.resolve([] as readonly TimelineEvent[]);
      return store.getIterationEvents(active.id, iterationId);
    },
    [active, store],
  );

  const toggleCompare = useCallback((id: string) => {
    setCompareSelection((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      // Keep only the most recent two selections.
      return [...current, id].slice(-2);
    });
  }, []);

  const value = useMemo<ExperimentContextValue>(
    () => ({
      experiments,
      active,
      baseStrategy,
      queuedOverrides,
      live,
      selectedIterationId,
      compareSelection,
      refresh,
      createExperiment,
      openExperiment,
      closeExperiment,
      queueOverride,
      removeQueuedOverride,
      clearQueue,
      runNextIteration,
      submitFeedback,
      selectIteration: setSelectedIterationId,
      getIterationEvents,
      toggleCompare,
    }),
    [
      experiments,
      active,
      baseStrategy,
      queuedOverrides,
      live,
      selectedIterationId,
      compareSelection,
      refresh,
      createExperiment,
      openExperiment,
      closeExperiment,
      queueOverride,
      removeQueuedOverride,
      clearQueue,
      runNextIteration,
      submitFeedback,
      getIterationEvents,
      toggleCompare,
    ],
  );

  return (
    <ExperimentContext.Provider value={value}>
      {children}
    </ExperimentContext.Provider>
  );
}

/** Access the experiment context. Throws when used outside the provider. */
export function useExperiment(): ExperimentContextValue {
  const context = useContext(ExperimentContext);
  if (!context) {
    throw new Error("useExperiment must be used within an ExperimentProvider");
  }
  return context;
}
