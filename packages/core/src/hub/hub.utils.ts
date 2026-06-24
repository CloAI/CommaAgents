import type { HubPackage, HubRegistrySnapshot } from "./hub.types";

/** Find a named package in a registry snapshot or throw when unavailable. */
export function findAvailableHubPackage(
  snapshot: HubRegistrySnapshot,
  name: string,
): HubPackage {
  const project = snapshot.registry.packages.find(
    (availablePackage) => availablePackage.name === name,
  );
  if (!project) throw new Error(`Hub package not found: ${name}`);
  return project;
}
