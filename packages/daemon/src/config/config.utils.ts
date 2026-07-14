import { existsSync, readFileSync } from "node:fs";
import { type DaemonConfig, DaemonConfigFileSchema } from ".";

export function readConfigFile(filePath: string): Partial<DaemonConfig> {
  if (!existsSync(filePath)) {
    return {};
  }

  const raw = readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  const parsed = DaemonConfigFileSchema.parse(json);

  // Convert to Partial<DaemonConfig> (only defined fields)
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<DaemonConfig>;
}
