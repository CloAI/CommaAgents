import {
  type DiscoveredStrategy,
  discoverStrategies,
} from "@comma-agents/core";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  StrategyDiscoveryContextValue,
  StrategyDiscoveryStatus,
} from "./useStrategies.types";

const StrategyDiscoveryContext =
  createContext<StrategyDiscoveryContextValue | null>(null);

/** Owns strategy discovery so package mutations can refresh every consumer. */
export function StrategyDiscoveryContextProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  const [strategies, setStrategies] = useState<readonly DiscoveredStrategy[]>(
    [],
  );
  const [status, setStatus] = useState<StrategyDiscoveryStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setStatus("loading");
    try {
      const result = await discoverStrategies();
      setStrategies(result.strategies);
      setError(null);
      setStatus("ready");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ strategies, status, error, refresh }),
    [error, refresh, status, strategies],
  );
  return (
    <StrategyDiscoveryContext.Provider value={value}>
      {children}
    </StrategyDiscoveryContext.Provider>
  );
}

function useStrategyDiscovery(): StrategyDiscoveryContextValue {
  const context = useContext(StrategyDiscoveryContext);
  if (!context) {
    throw new Error(
      "useStrategyDiscovery must be used inside StrategyDiscoveryContextProvider",
    );
  }
  return context;
}

export function useDiscoveredStrategies(): readonly DiscoveredStrategy[] {
  return useStrategyDiscovery().strategies;
}

export function useStrategyDiscoveryStatus(): {
  readonly status: StrategyDiscoveryStatus;
  readonly error: string | null;
} {
  const { status, error } = useStrategyDiscovery();
  return { status, error };
}

export function useRefreshDiscoveredStrategies(): () => Promise<void> {
  return useStrategyDiscovery().refresh;
}
