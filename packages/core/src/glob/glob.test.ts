import { describe, expect, it } from "vitest";
import baseline from "./glob.fixtures.json";
import { compileGlob } from "./glob";

describe("compileGlob", () => {
  for (const { pattern, matches } of baseline.fixtures) {
    it(`should preserve Bun baseline matches for ${JSON.stringify(pattern)}`, () => {
      expect(baseline.paths.filter(compileGlob(pattern))).toEqual(matches);
    });
  }

  it("should preserve empty and negated empty patterns", () => {
    expect(compileGlob("")("anything")).toBe(false);
    expect(compileGlob("")("")).toBe(true);
    expect(compileGlob("!")("anything")).toBe(true);
    expect(compileGlob("!")("")).toBe(false);
  });

  it("should match hidden files in sandbox wildcard rules", () => {
    expect(compileGlob("**/*")(".env")).toBe(true);
    expect(compileGlob("**")(".git/config")).toBe(true);
    expect(compileGlob("**/.env*")("config/.env.local")).toBe(true);
  });
});
