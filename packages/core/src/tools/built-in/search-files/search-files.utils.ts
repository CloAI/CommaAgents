import { sep } from "node:path";
import { toolError } from "../../result";

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

export function buildPreview(
  lines: readonly string[],
  lineIndex: number,
  contextLines: number,
): string {
  const start = Math.max(0, lineIndex - contextLines);
  const end = Math.min(lines.length - 1, lineIndex + contextLines);
  const out: string[] = [];
  for (let i = start; i <= end; i++) {
    out.push(`${i + 1}: ${lines[i]}`);
  }
  return out.join("\n");
}

export function compileRegex(
  query: string,
):
  | { regex: RegExp; error?: undefined }
  | { regex?: undefined; error: ReturnType<typeof toolError> } {
  try {
    return { regex: new RegExp(query, "m") };
  } catch (caughtError) {
    return {
      error: toolError(
        "command_failed",
        `Invalid regex: ${(caughtError as Error).message}`,
        {
          recoverable: true,
          suggestedNextAction:
            "Fix the regex syntax and call search_files again.",
        },
      ),
    };
  }
}
