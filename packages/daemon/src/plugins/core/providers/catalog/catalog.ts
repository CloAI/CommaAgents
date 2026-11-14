import {
  getGlobalCredentialStore,
  listProviders,
  refreshCatalog,
  refreshProviderModels,
} from "@comma-agents/core";
import type { ProvidersSnapshot } from "../../core.types";
import type { ProviderCatalog } from "./catalog.types";

/**
 * Keep one provider list for the daemon, rebuilding it one change at a time.
 * @param {(snapshot: ProvidersSnapshot) => void} publish - Receives every new snapshot.
 * @returns {ProviderCatalog} Snapshot access and the rebuilds that publish it.
 * @example
 * const catalog = createProviderCatalog((snapshot) => notify(snapshot));
 * await catalog.load();
 */
export function createProviderCatalog(
  publish: (snapshot: ProvidersSnapshot) => void,
): ProviderCatalog {
  let snapshot: ProvidersSnapshot = { providers: [], refreshing: false };
  let queue = Promise.resolve();
  let started = false;
  let markReady = () => {};
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  async function update(refreshing: boolean): Promise<void> {
    snapshot = {
      providers: await listProviders(getGlobalCredentialStore()),
      refreshing,
    };
    publish(snapshot);
    markReady();
  }

  function rebuild(fetch?: () => Promise<void>): Promise<void> {
    started = true;
    const run = queue.then(async () => {
      if (fetch) {
        await update(true);
        // Failed refreshes keep models.dev and manual models.
        await fetch().catch(() => {});
      }
      await update(false);
    });
    queue = run.catch(() => {});
    return run;
  }

  return {
    snapshot: () => snapshot,
    ready() {
      if (!started) {
        void rebuild();
      }
      return ready;
    },
    load: () =>
      rebuild(() => refreshProviderModels(getGlobalCredentialStore())),
    refresh: () =>
      rebuild(async () => {
        await refreshCatalog();
        await refreshProviderModels(getGlobalCredentialStore());
      }),
    refreshProvider: (providerId) =>
      rebuild(() =>
        refreshProviderModels(getGlobalCredentialStore(), { providerId }),
      ),
    rebuild: () => rebuild(),
  };
}
