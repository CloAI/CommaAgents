import { describe, expect, it } from "bun:test";
import {
  collectReleaseManifestErrors,
  parseReleaseTag,
  synchronizeReleaseManifest,
} from "./release-version.utils";

describe("release version utilities", () => {
  it("should parse version tags", () => {
    expect(parseReleaseTag("refs/tags/v2.0.0-rc.2")).toBe("2.0.0-rc.2");
    expect(() => parseReleaseTag("release-2.0.0")).toThrow(
      "Release tags must use the form v<semver>",
    );
  });

  it("should synchronize versions without reformatting the manifest", () => {
    const contents = `{
  "name": "@comma-agents/daemon",
  "version": "2.0.0-rc.1",
  "dependencies": {
    "@comma-agents/core": "workspace:*",
    "yaml": "2.8.3"
  }
}
`;

    expect(
      synchronizeReleaseManifest(
        contents,
        "packages/daemon/package.json",
        "2.0.0-rc.2",
      ),
    ).toBe(`{
  "name": "@comma-agents/daemon",
  "version": "2.0.0-rc.2",
  "dependencies": {
    "@comma-agents/core": "2.0.0-rc.2",
    "yaml": "2.8.3"
  }
}
`);
  });

  it("should report package version and dependency drift", () => {
    const errors = collectReleaseManifestErrors(
      {
        path: "package.json",
        contents: '{"name":"comma-agents","version":"2.0.0-rc.2"}',
      },
      [
        {
          path: "packages/daemon/package.json",
          contents: JSON.stringify({
            name: "@comma-agents/daemon",
            version: "2.0.0-rc.1",
            dependencies: {
              "@comma-agents/core": "workspace:*",
            },
          }),
        },
      ],
    );

    expect(errors).toEqual([
      "@comma-agents/daemon is 2.0.0-rc.1; expected 2.0.0-rc.2",
      "@comma-agents/daemon dependencies.@comma-agents/core uses workspace:*",
    ]);
  });

  it("should reject a tag version that differs from its commit", () => {
    const errors = collectReleaseManifestErrors(
      {
        path: "package.json",
        contents: '{"name":"comma-agents","version":"2.0.0-rc.1"}',
      },
      [
        {
          path: "packages/core/package.json",
          contents:
            '{"name":"@comma-agents/core","version":"2.0.0-rc.1"}',
        },
      ],
      "2.0.0-rc.2",
    );

    expect(errors).toEqual([
      "package.json is 2.0.0-rc.1; expected 2.0.0-rc.2",
      "@comma-agents/core is 2.0.0-rc.1; expected 2.0.0-rc.2",
    ]);
  });
});
