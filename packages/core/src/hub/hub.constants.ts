import type { HubRepositoryConfig } from "./hub.types";

export const DEFAULT_HUB_REPOSITORY: HubRepositoryConfig = {
  owner: "CloAI",
  repository: "CommaAgentsHub",
  branch: "main",
};

export const HUB_MAX_FILES = 2_000;
export const HUB_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const HUB_INSTALLED_STATE_FILENAME = "installed-packages.json";
