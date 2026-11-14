import { existsSync } from "node:fs";
import { resolve } from "node:path";

const releasePackageEntrypoints: Readonly<Record<string, string>> = {
  "@comma-agents/core/hub": resolve(
    import.meta.dirname,
    "../../core/dist/hub/index.js",
  ),
  "@comma-agents/core/sandbox": resolve(
    import.meta.dirname,
    "../../core/dist/sandbox/index.js",
  ),
  "@comma-agents/core/strategy": resolve(
    import.meta.dirname,
    "../../core/dist/strategy/index.js",
  ),
  "@comma-agents/core/conversation-context": resolve(
    import.meta.dirname,
    "../../core/dist/conversation-context/index.js",
  ),
  "@comma-agents/core/skills": resolve(
    import.meta.dirname,
    "../../core/dist/skills/index.js",
  ),
  "@comma-agents/core/mcp": resolve(
    import.meta.dirname,
    "../../core/dist/mcp/index.js",
  ),
  "@comma-agents/core/language": resolve(
    import.meta.dirname,
    "../../core/dist/language/index.js",
  ),
  "@comma-agents/core": resolve(
    import.meta.dirname,
    "../../core/dist/index.js",
  ),
  "@comma-agents/daemon": resolve(
    import.meta.dirname,
    "../../daemon/dist/index.js",
  ),
  "@comma-agents/tui": resolve(import.meta.dirname, "../../tui/dist/index.js"),
};

export function assertReleasePackageEntrypoints(): void {
  const missingEntrypoints = Object.entries(releasePackageEntrypoints)
    .filter(([, path]) => !existsSync(path))
    .map(([specifier]) => specifier);
  if (missingEntrypoints.length > 0) {
    throw new Error(
      `Missing built release packages: ${missingEntrypoints.join(", ")}. Run pnpm build from the repository root.`,
    );
  }
}
