import { describe, expect, it } from "vitest";
import { paneTitle } from "./ChatPane.utils";

describe("paneTitle", () => {
  it("should call the root route a new chat", () => {
    expect(paneTitle("/")).toBe("New chat");
  });

  it("should shorten a run's identifier", () => {
    expect(paneTitle("/runs/12345678-aaaa-bbbb")).toBe("Run 12345678");
    expect(paneTitle("/runs/short")).toBe("Run short");
  });

  it("should fall back to the route itself", () => {
    expect(paneTitle("/elsewhere")).toBe("/elsewhere");
  });
});
