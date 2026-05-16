import { sep } from "node:path";
import type {
  ListDirectoryData,
  ListDirectoryEntry,
} from "./list-directory.types";

export function toForwardSlash(pathString: string): string {
  return sep === "/" ? pathString : pathString.split(sep).join("/");
}

export function formatListing(data: ListDirectoryData): string {
  if (data.entries.length === 0) {
    return `Listed ${data.path} — empty directory.`;
  }
  const lines = data.entries.map((entry) => {
    const suffix =
      entry.type === "directory"
        ? "/"
        : entry.type === "symlink"
          ? " -> (symlink)"
          : "";
    const indent = "  ".repeat(Math.max(0, entry.depth - 1));
    return `${indent}${entry.name}${suffix}`;
  });
  const header = `Listed ${data.path} — ${data.entries.length} entr${data.entries.length === 1 ? "y" : "ies"}${
    data.truncated ? " (truncated)" : ""
  }`;
  return `${header}\n${lines.join("\n")}`;
}

export function typeRank(type: ListDirectoryEntry["type"]): number {
  return type === "directory" ? 0 : type === "file" ? 1 : 2;
}
