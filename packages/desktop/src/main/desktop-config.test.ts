import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDesktopConfig, updateDesktopConfig } from "./desktop-config";

const file = () =>
  join(mkdtempSync(join(tmpdir(), "comma-desktop-")), "nested", "desktop.json");
const window = { x: 10, y: 20, width: 900, height: 700, maximized: true };

describe("desktop configuration", () => {
  it("is empty when the file is missing or unreadable", () => {
    const path = file();
    expect(readDesktopConfig(path)).toEqual({ version: 1 });

    updateDesktopConfig(path, { background: true });
    writeFileSync(path, "not json");
    expect(readDesktopConfig(path)).toEqual({ version: 1 });
  });

  it("keeps the other values when one changes", () => {
    const path = file();
    updateDesktopConfig(path, { window });
    updateDesktopConfig(path, { background: false });

    expect(readDesktopConfig(path)).toEqual({
      version: 1,
      window,
      background: false,
    });
    expect(JSON.parse(readFileSync(path, "utf8")).version).toBe(1);
  });

  it("drops only the field that is invalid", () => {
    const path = file();
    updateDesktopConfig(path, { background: true });
    writeFileSync(
      path,
      JSON.stringify({ version: 1, window: { width: 10 }, background: true }),
    );

    expect(readDesktopConfig(path)).toEqual({ version: 1, background: true });
  });
});
