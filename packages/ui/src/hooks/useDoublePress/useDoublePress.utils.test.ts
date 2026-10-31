import { describe, expect, it } from "vitest";
import { isPlainPress } from "./useDoublePress.utils";

const escape = {
  key: "Escape",
  defaultPrevented: false,
  isComposing: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
};

describe("isPlainPress", () => {
  it("should accept an unmodified press of the watched key", () => {
    expect(isPlainPress(escape, "Escape")).toBe(true);
  });

  it("should reject other keys, modifiers, composition, and consumed events", () => {
    expect(isPlainPress({ ...escape, key: "Enter" }, "Escape")).toBe(false);
    expect(isPlainPress({ ...escape, shiftKey: true }, "Escape")).toBe(false);
    expect(isPlainPress({ ...escape, metaKey: true }, "Escape")).toBe(false);
    expect(isPlainPress({ ...escape, isComposing: true }, "Escape")).toBe(
      false,
    );
    expect(isPlainPress({ ...escape, defaultPrevented: true }, "Escape")).toBe(
      false,
    );
  });
});
