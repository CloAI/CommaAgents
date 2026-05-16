import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256OfBuffer, sha256OfFile } from "./hash";

describe("sha256OfBuffer", () => {
  it("matches the well-known digest of 'hello'", () => {
    expect(sha256OfBuffer("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("returns a 64-char lowercase hex string for empty input", () => {
    const digest = sha256OfBuffer("");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("accepts Uint8Array input", () => {
    const bytes = new TextEncoder().encode("hello");
    expect(sha256OfBuffer(bytes)).toBe(sha256OfBuffer("hello"));
  });
});

describe("sha256OfFile", () => {
  it("matches sha256OfBuffer for the same content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hash-test-"));
    const path = join(dir, "f.txt");
    await writeFile(path, "hello");
    expect(await sha256OfFile(path)).toBe(sha256OfBuffer("hello"));
  });
});
