import { describe, expect, it } from "bun:test";
import { CommaProjectManifestSchema, HubRegistrySchema } from "./hub.schema";

const validManifest = {
  name: "@example/project",
  version: "1.2.3",
  strategies: {
    main: { path: "./strategies/main.json", expose: true },
  },
};

describe("CommaProjectManifestSchema", () => {
  it("accepts the artifact-map project contract", () => {
    expect(CommaProjectManifestSchema.parse(validManifest)).toEqual(
      validManifest,
    );
  });

  it("rejects legacy strategy arrays", () => {
    expect(() =>
      CommaProjectManifestSchema.parse({
        name: "@example/project",
        version: "1.2.3",
        strategies: ["./main.json"],
      }),
    ).toThrow();
  });

  it("rejects display names and incomplete semantic versions", () => {
    expect(() =>
      CommaProjectManifestSchema.parse({ name: "Example", version: "1.0" }),
    ).toThrow();
  });
});

describe("HubRegistrySchema", () => {
  it("accepts exposed package metadata", () => {
    expect(
      HubRegistrySchema.parse({
        version: 1,
        packages: [
          {
            name: "@example/project",
            version: "1.2.3",
            path: "packages/@example/project",
            exports: { strategies: [], agents: [], flows: [], tools: [] },
          },
        ],
      }).packages,
    ).toHaveLength(1);
  });
});
