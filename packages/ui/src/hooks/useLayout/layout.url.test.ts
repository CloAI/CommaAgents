import { describe, expect, it } from "vitest";
import { hashFromPath, pathFromHash } from "./layout.url";

describe("address-bar hash", () => {
  it("should read a route from the hash", () => {
    expect(pathFromHash("#/runs/abc")).toBe("/runs/abc");
    expect(pathFromHash("#/")).toBe("/");
  });

  it("should treat an empty or non-route hash as no route", () => {
    expect(pathFromHash("")).toBeUndefined();
    expect(pathFromHash("#")).toBeUndefined();
    expect(pathFromHash("#section")).toBeUndefined();
  });

  it("should write a route as a hash", () => {
    expect(hashFromPath("/runs/abc")).toBe("#/runs/abc");
    expect(pathFromHash(hashFromPath("/runs/abc"))).toBe("/runs/abc");
  });
});
