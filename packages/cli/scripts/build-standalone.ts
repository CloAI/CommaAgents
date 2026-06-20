import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const SUPPORTED_TARGETS = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-arm64",
  "bun-linux-arm64-musl",
  "bun-linux-x64-baseline",
  "bun-linux-x64-musl-baseline",
  "bun-windows-arm64",
  "bun-windows-x64-baseline",
] as const;

type StandaloneTarget = (typeof SUPPORTED_TARGETS)[number];

const packageManifest = (await Bun.file("package.json").json()) as {
  readonly version: string;
};
const workspaceAliases = {
  "@comma-agents/core": resolve("../core/src/index.ts"),
  "@comma-agents/daemon": resolve("../daemon/src/index.ts"),
  "@comma-agents/tui": resolve("../tui/src/index.ts"),
};

function resolveHostTarget(): StandaloneTarget {
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "bun-darwin-arm64" : "bun-darwin-x64";
  }
  if (process.platform === "win32") {
    return process.arch === "arm64"
      ? "bun-windows-arm64"
      : "bun-windows-x64-baseline";
  }
  return process.arch === "arm64"
    ? "bun-linux-arm64"
    : "bun-linux-x64-baseline";
}

function isStandaloneTarget(value: string): value is StandaloneTarget {
  return SUPPORTED_TARGETS.some((target) => target === value);
}

async function buildTarget(target: StandaloneTarget): Promise<void> {
  const targetName = target.replace("bun-", "").replace("-baseline", "");
  const outputDir = `dist/standalone/${targetName}`;
  const executableName = target.includes("windows") ? "comma.exe" : "comma";
  mkdirSync(outputDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: ["src/main.ts"],
    compile: {
      target,
      outfile: `${outputDir}/${executableName}`,
      autoloadDotenv: false,
      autoloadBunfig: false,
    },
    minify: true,
    alias: workspaceAliases,
    define: {
      "process.env.COMMA_BUILD_VERSION": JSON.stringify(
        packageManifest.version,
      ),
      "process.env.COMMA_STANDALONE_BUILD": JSON.stringify("1"),
    },
  });

  if (!result.success) {
    throw new AggregateError(result.logs, `Failed to compile ${target}`);
  }
}

const requestedTarget = process.argv[2] ?? resolveHostTarget();
rmSync("dist/standalone", { recursive: true, force: true });
if (requestedTarget === "all") {
  for (const target of SUPPORTED_TARGETS) {
    await buildTarget(target);
  }
} else if (isStandaloneTarget(requestedTarget)) {
  await buildTarget(requestedTarget);
} else {
  throw new Error(
    `Unknown target ${requestedTarget}. Expected all or one of: ${SUPPORTED_TARGETS.join(", ")}`,
  );
}
