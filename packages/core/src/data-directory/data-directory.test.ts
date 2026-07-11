import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import { resolveApplicationDataDirectory } from "./data-directory";

describe("resolveApplicationDataDirectory", () => {
  it("should resolve the .comma directory under the current user's home", () => {
    expect(resolveApplicationDataDirectory()).toBe(join(homedir(), ".comma"));
  });
});
