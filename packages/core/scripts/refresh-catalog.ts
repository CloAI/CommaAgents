#!/usr/bin/env bun
// Refresh the bundled models.dev catalog snapshot.
//
// Fetches https://models.dev/api.json and writes the result to
// packages/core/src/model/providers/catalog/catalog.data.json. Run this
// periodically (e.g., before releases) to update the bundled baseline.
//
// Usage:
//   bun run packages/core/scripts/refresh-catalog.ts

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CATALOG_URL = "https://models.dev/api.json";
const OUTPUT_PATH = resolve(
  import.meta.dir,
  "..",
  "src",
  "model",
  "providers",
  "catalog",
  "catalog.data.json",
);

async function main(): Promise<void> {
  console.log(`Fetching catalog from ${CATALOG_URL}...`);
  const response = await fetch(CATALOG_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  const parsed = JSON.parse(body) as Record<string, unknown>;
  const providerCount = Object.keys(parsed).length;
  const modelCount = Object.values(parsed).reduce<number>((total, provider) => {
    const models = (provider as { models?: Record<string, unknown> }).models ?? {};
    return total + Object.keys(models).length;
  }, 0);

  writeFileSync(OUTPUT_PATH, body, "utf8");
  console.log(
    `Wrote ${body.length.toLocaleString()} bytes to ${OUTPUT_PATH}`,
  );
  console.log(`  providers: ${providerCount}`);
  console.log(`  models:    ${modelCount}`);
}

main().catch((error) => {
  console.error("refresh-catalog failed:", error);
  process.exit(1);
});
