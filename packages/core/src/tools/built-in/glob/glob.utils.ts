import { sep } from "node:path";
import type { GlobData } from "./glob.types";

export function toForwardSlash(pathString: string): string {
  return sep === "/" ? pathString : pathString.split(sep).join("/");
}

export function matchesAnyGlob(
  relPath: string,
  patterns: readonly string[],
): boolean {
  for (const pattern of patterns) {
    if (new Bun.Glob(pattern).match(relPath)) return true;
  }
  return false;
}

export function formatGlobResults(data: GlobData): string {
  if (data.matches.length === 0) {
    return `No matches for glob "${data.pattern}" under "${data.root}".`;
  }

  const lines = data.matches.map((match) => {
    const suffix = match.type === "directory" ? "/" : "";
    return `  ${match.path}${suffix} (${match.type})`;
  });

  const header = `Matched ${data.matches.length} entr${
    data.matches.length === 1 ? "y" : "ies"
  } for glob "${data.pattern}" under "${data.root}"${
    data.truncated ? " (truncated)" : ""
  }:`;

  return `${header}\n${lines.join("\n")}`;
}
