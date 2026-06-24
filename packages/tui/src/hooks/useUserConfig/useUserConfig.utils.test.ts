import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import { resolveDefaultConfigFilePath } from "./useUserConfig.utils";

describe("resolveDefaultConfigFilePath", () => {
  it("should resolve the TUI config from the shared data directory", () => {
    expect(resolveDefaultConfigFilePath()).toBe(
      join(homedir(), ".comma", "tui-config.json"),
    );
  });
});
