import { describe, expect, it } from "vitest";
import { WEB_HOST } from "./useHost.context";

describe("WEB_HOST", () => {
  it("offers no host-provided connection", () => {
    expect(WEB_HOST.createSocket).toBeUndefined();
  });
});
