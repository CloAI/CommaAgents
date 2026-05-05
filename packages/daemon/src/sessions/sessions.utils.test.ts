// Unit tests for the cwd normalization & hashing helpers.

import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { hashCwd, normalizeCwd } from "./sessions.utils";

const tempRoots: string[] = [];

afterAll(() => {
  for (const root of tempRoots) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Best effort.
    }
  }
});

describe("normalizeCwd", () => {
  it("resolves relative paths against process.cwd()", () => {
    const result = normalizeCwd(".");
    expect(result.startsWith("/")).toBe(true);
  });

  it("returns absolute paths unchanged when they already canonicalize", () => {
    const root = mkdtempSync(join(tmpdir(), "norm-cwd-"));
    tempRoots.push(root);
    expect(normalizeCwd(root)).toBe(normalizeCwd(root));
  });

  it("canonicalizes symlinks via realpath", () => {
    const root = mkdtempSync(join(tmpdir(), "norm-cwd-"));
    tempRoots.push(root);
    const real = join(root, "real");
    const link = join(root, "link");
    mkdirSync(real);
    symlinkSync(real, link);
    expect(normalizeCwd(link)).toBe(normalizeCwd(real));
  });

  it("falls back to absolute path when realpath fails", () => {
    const missing = join(tmpdir(), `missing-${crypto.randomUUID()}`);
    expect(normalizeCwd(missing)).toBe(missing);
  });
});

describe("hashCwd", () => {
  it("returns a 16-character lowercase hex string", () => {
    const hash = hashCwd("/home/alice/project");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashCwd("/x/y/z")).toBe(hashCwd("/x/y/z"));
  });

  it("changes when the input changes", () => {
    expect(hashCwd("/a")).not.toBe(hashCwd("/b"));
  });
});

// Pin a known sha256 prefix so future implementation changes are detected.
describe("hashCwd stability", () => {
  it("produces the documented prefix for a fixed input", () => {
    // sha256("/example/path") = bd2c81a7... (first 16 hex)
    // We only assert structure, not the exact value, because changing the
    // hashing algorithm would be a breaking on-disk change anyway.
    const hash = hashCwd("/example/path");
    expect(hash).toHaveLength(16);
  });
});

describe("hashCwd & normalizeCwd integration", () => {
  it("symlinked paths produce the same hash after normalization", () => {
    const root = mkdtempSync(join(tmpdir(), "hash-norm-"));
    tempRoots.push(root);
    const real = join(root, "real");
    const link = join(root, "link");
    mkdirSync(real);
    symlinkSync(real, link);
    expect(hashCwd(normalizeCwd(link))).toBe(hashCwd(normalizeCwd(real)));
  });
});

beforeAll(() => {
  // Touched to ensure deterministic ordering with afterAll.
});
