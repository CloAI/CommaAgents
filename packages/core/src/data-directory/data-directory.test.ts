import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import { resolveDataDir } from "./data-directory";

describe("resolveDataDir", () => {
  it("should resolve the .comma directory under the current user's home", () => {
    expect(resolveDataDir()).toBe(join(homedir(), ".comma"));
  });
});
