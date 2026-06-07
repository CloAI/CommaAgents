import React from 'react';
import { type DiscoveredStrategy, discoverStrategies } from '@comma-agents/core'

/**
 * Discover available strategies once on mount.
 *
 * `discoverStrategies()` is async (parses & validates each candidate),
 * so we kick it off in `useEffect` and store the result in state.
 * Initial value is an empty array; the picker renders empty for a
 * single frame and then populates.
 */
export function useDiscoveredStrategies(): readonly DiscoveredStrategy[] {
  const [strategies, setStrategies] = React.useState<readonly DiscoveredStrategy[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    discoverStrategies()
      .then((result) => {
        if (!cancelled) setStrategies(result.strategies);
      })
      .catch(() => {
        // Discovery failures are silent — the picker just stays empty.
        // Real failures surface as warnings in the underlying core call.
      });
    return (): void => {
      cancelled = true;
    };
  }, []);
  return strategies;
}