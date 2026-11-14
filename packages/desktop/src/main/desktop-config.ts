import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getApplicationDataDirectory } from "@comma-agents/core";
import { z } from "zod/v4";

const WindowStateSchema = z.object({
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().min(400),
  height: z.number().int().min(300),
  maximized: z.boolean(),
});
// A bad value in one field must not discard the others.
const DesktopConfigSchema = z.object({
  version: z.literal(1),
  window: WindowStateSchema.optional().catch(undefined),
  background: z.boolean().optional().catch(undefined),
});

/** Saved window placement. */
export type WindowState = z.infer<typeof WindowStateSchema>;

/** Preferences stored in `desktop.json`. */
type DesktopConfig = z.infer<typeof DesktopConfigSchema>;

/** The values that can be changed in a saved configuration. */
type DesktopConfigPatch = Partial<Omit<DesktopConfig, "version">>;

/**
 * Locate the desktop configuration file beside the daemon's configuration.
 * @returns {string} Path of `desktop.json` in the application data directory.
 */
export function desktopConfigFile(): string {
  return join(getApplicationDataDirectory(), "desktop.json");
}

/**
 * Read the saved configuration, ignoring a missing or invalid file.
 * @param {string} file - Desktop configuration file.
 * @returns {DesktopConfig} Saved configuration, or an empty one.
 */
export function readDesktopConfig(file: string): DesktopConfig {
  try {
    return DesktopConfigSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return { version: 1 };
  }
}

/**
 * Change some values and keep the rest, writing atomically.
 * @param {string} file - Desktop configuration file.
 * @param {DesktopConfigPatch} patch - Values to replace.
 * @returns {void}
 */
export function updateDesktopConfig(
  file: string,
  patch: DesktopConfigPatch,
): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(
    temporary,
    JSON.stringify({ ...readDesktopConfig(file), ...patch }, null, 2),
  );
  renameSync(temporary, file);
}
