import { existsSync, readFileSync } from "node:fs";
import type { TimelineEvent } from "@comma-agents/core";

/**
 * Read a JSONL run file, optionally rejecting malformed records.
 *
 * @param {string} filePath - JSONL file to read.
 * @param {boolean} strict - Throw when a record cannot be read or parsed.
 * @returns {TimelineEvent[]} Parsed timeline events, excluding malformed records.
 */
export function readRunEventsFile(
  filePath: string,
  strict = false,
): TimelineEvent[] {
  if (!existsSync(filePath)) {
    return [];
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (error) {
    if (strict) {
      throw error;
    }
    return [];
  }

  const events: TimelineEvent[] = [];
  const lines = raw.split("\n");
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") {
      continue;
    }
    try {
      events.push(JSON.parse(line) as TimelineEvent);
    } catch {
      if (strict) {
        throw new Error(`Malformed run timeline at ${filePath}:${index + 1}`);
      }
      // Ignore malformed lines to survive single-record corruption
      console.error(
        `Found a malformed line when parsing the timeline event, Line: ${line}`,
      );
    }
  }
  return events;
}
