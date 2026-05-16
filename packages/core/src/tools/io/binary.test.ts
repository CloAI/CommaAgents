import { describe, expect, it } from "bun:test";
import { isLikelyBinary } from "./binary";

describe("isLikelyBinary", () => {
  it("returns false for pure ASCII text", () => {
    const bytes = new TextEncoder().encode("hello world\nthis is text");
    expect(isLikelyBinary(bytes)).toBe(false);
  });

  it("returns false for UTF-8 multibyte text", () => {
    const bytes = new TextEncoder().encode("héllo — café 日本語");
    expect(isLikelyBinary(bytes)).toBe(false);
  });

  it("returns true when a NUL byte appears in the sample window", () => {
    const bytes = new Uint8Array([0x68, 0x69, 0x00, 0x61]); // "hi\0a"
    expect(isLikelyBinary(bytes)).toBe(true);
  });

  it("returns false for an empty buffer", () => {
    expect(isLikelyBinary(new Uint8Array(0))).toBe(false);
  });

  it("does not look past the 8 KiB sample window", () => {
    // 8 KiB of text followed by a NUL — falls outside the sample, treated as text.
    const sample = new Uint8Array(8 * 1024).fill(0x41); // 8KiB of 'A'
    const tail = new Uint8Array([0x00]);
    const buffer = new Uint8Array(sample.length + tail.length);
    buffer.set(sample, 0);
    buffer.set(tail, sample.length);
    expect(isLikelyBinary(buffer)).toBe(false);
  });
});
