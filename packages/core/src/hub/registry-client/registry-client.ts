import { HubRegistrySchema } from "../hub.schema";
import type { HubRegistrySnapshot } from "../hub.types";
import type {
  CreateHubRegistryClientOptions,
  HubRegistryClient,
} from "./registry-client.types";

/** Create a client for fetching a Hub registry and its repository archive. */
export function createHubRegistryClient({
  repository,
  fetch,
}: CreateHubRegistryClientOptions): HubRegistryClient {
  let registrySnapshot: HubRegistrySnapshot | undefined;

  async function fetchRequired(url: string): Promise<Response> {
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok)
      throw new Error(`Hub request failed (${response.status}): ${url}`);
    return response;
  }

  async function refresh(): Promise<HubRegistrySnapshot> {
    const repositoryUrl = `https://api.github.com/repos/${repository.owner}/${repository.repository}`;
    const commitResponse = await fetchRequired(
      `${repositoryUrl}/commits/${repository.branch}`,
    );
    const commitJson = (await commitResponse.json()) as { sha?: unknown };
    if (typeof commitJson.sha !== "string")
      throw new Error("Hub commit response did not contain a SHA");

    const registryResponse = await fetchRequired(
      `https://raw.githubusercontent.com/${repository.owner}/${repository.repository}/${commitJson.sha}/registry.json`,
    );
    const parsedRegistry = HubRegistrySchema.safeParse(
      await registryResponse.json(),
    );
    if (!parsedRegistry.success) {
      throw new Error(
        `Hub registry validation failed: ${parsedRegistry.error.message}`,
      );
    }

    registrySnapshot = {
      commit: commitJson.sha,
      registry: parsedRegistry.data,
    };
    return registrySnapshot;
  }

  return {
    refresh,
    async getSnapshot() {
      return registrySnapshot ?? refresh();
    },
    async fetchArchive(commit) {
      const archiveResponse = await fetchRequired(
        `https://codeload.github.com/${repository.owner}/${repository.repository}/tar.gz/${commit}`,
      );
      return new Uint8Array(await archiveResponse.arrayBuffer());
    },
  };
}
