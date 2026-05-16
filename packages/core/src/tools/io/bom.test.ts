import { describe, expect, it } from "bun:test";
import { applyBom, BOM, hasBom, stripBom } from "./bom";

describe("hasBom", () => {
  it("returns true for BOM-prefixed content", () => {
    expect(hasBom(`${BOM}hello`)).toBe(true);
  });

  it("returns false for normal content", () => {
    expect(hasBom("hello")).toBe(false);
    expect(hasBom("")).toBe(false);
  });
});

describe("stripBom", () => {
  it("removes a leading BOM", () => {
    expect(stripBom(`${BOM}hello`)).toBe("hello");
  });

  it("leaves non-BOM content unchanged", () => {
    expect(stripBom("hello")).toBe("hello");
    expect(stripBom("")).toBe("");
  });
});

describe("applyBom", () => {
  it("adds a BOM when hadBom is true and content lacks one", () => {
    expect(applyBom("hello", true)).toBe(`${BOM}hello`);
  });

  it("is idempotent when content already has a BOM", () => {
    expect(applyBom(`${BOM}hello`, true)).toBe(`${BOM}hello`);
  });

  it("does nothing when hadBom is false", () => {
    expect(applyBom("hello", false)).toBe("hello");
    expect(applyBom(`${BOM}hello`, false)).toBe(`${BOM}hello`);
  });
});
