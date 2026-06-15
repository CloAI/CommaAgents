import { existsSync, readFileSync } from "node:fs";
import type { TimelineEvent } from "@comma-agents/core";

/** Read a JSONL run file and return parsed events. Malformed lines are skipped. */
export function readRunEventsFile(filePath: string): TimelineEvent[] {
  if (!existsSync(filePath)) return [];

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const events: TimelineEvent[] = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line) as TimelineEvent);
    } catch {
      // Ignore malformed lines to survive single-record corruption
      console.error(
        `Found a malformed line when parsing the timeline event, Line: ${line}`,
      );
    }
  }
  return events;
}
