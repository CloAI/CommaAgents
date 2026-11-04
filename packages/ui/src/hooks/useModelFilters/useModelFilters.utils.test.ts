import { describe, expect, it } from "vitest";
import { exampleProviders } from "../../components/SettingsDialog/ProvidersSettings/test.utils";
import { NO_FILTERS } from "./useModelFilters.constants";
import type { ProviderMatch } from "./useModelFilters.types";
import { filterProviders } from "./useModelFilters.utils";

const matchIds = (providerMatches: readonly ProviderMatch[]) =>
  providerMatches.map(({ provider, models }) => [
    provider.id,
    models.map((model) => model.id),
  ]);

describe("filterProviders", () => {
  it("should keep everything without filters", () => {
    expect(matchIds(filterProviders(exampleProviders, NO_FILTERS))).toEqual([
      ["alpha", ["vision-tools", "reasoner", "unknown"]],
      ["beta", ["all-rounder"]],
      ["empty", []],
    ]);
  });

  it("should keep every model of a provider whose name matches", () => {
    expect(
      matchIds(
        filterProviders(exampleProviders, { ...NO_FILTERS, search: " ALPHA " }),
      ),
    ).toEqual([["alpha", ["vision-tools", "reasoner", "unknown"]]]);
  });

  it("should match models by name, ID, or family", () => {
    expect(
      matchIds(
        filterProviders(exampleProviders, { ...NO_FILTERS, search: "logic" }),
      ),
    ).toEqual([["alpha", ["reasoner"]]]);
  });

  it("should rank provider name and ID matches ahead of model matches in catalog order", () => {
    const providers = [
      { ...exampleProviders[0]!, id: "model-first", name: "Other" },
      { ...exampleProviders[1]!, id: "by-name", name: "Reasoner provider" },
      { ...exampleProviders[0]!, id: "model-second", name: "Another" },
      { ...exampleProviders[1]!, id: "reasoner-provider", name: "By ID" },
    ];

    expect(
      matchIds(
        filterProviders(providers, { ...NO_FILTERS, search: " REASONER " }),
      ),
    ).toEqual([
      ["by-name", ["all-rounder"]],
      ["reasoner-provider", ["all-rounder"]],
      ["model-first", ["reasoner"]],
      ["model-second", ["reasoner"]],
    ]);
    expect(
      filterProviders(providers, NO_FILTERS).map(({ provider }) => provider.id),
    ).toEqual(["model-first", "by-name", "model-second", "reasoner-provider"]);
  });

  it("should require every chosen capability and hide empty providers", () => {
    expect(
      matchIds(
        filterProviders(exampleProviders, {
          ...NO_FILTERS,
          capabilities: ["tools", "reasoning"],
        }),
      ),
    ).toEqual([["beta", ["all-rounder"]]]);
  });

  it("should limit to the chosen providers", () => {
    expect(
      matchIds(
        filterProviders(exampleProviders, {
          ...NO_FILTERS,
          providerIds: ["empty"],
        }),
      ),
    ).toEqual([["empty", []]]);
  });
});
