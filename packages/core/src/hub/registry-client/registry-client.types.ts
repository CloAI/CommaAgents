import type { HubRegistrySnapshot, HubRepositoryConfig } from "../hub.types";

export interface HubRegistryClient {
  refresh(): Promise<HubRegistrySnapshot>;
  getSnapshot(): Promise<HubRegistrySnapshot>;
  fetchArchive(commit: string): Promise<Uint8Array>;
}

export interface CreateHubRegistryClientOptions {
  readonly repository: HubRepositoryConfig;
  readonly fetch: typeof globalThis.fetch;
}
