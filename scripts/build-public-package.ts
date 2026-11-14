import { spawnSync } from "node:child_process";
import { build } from "rolldown";
import {
  chmodSync,
  cpSync,
  existsSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface PublicPackageConfig {
  readonly directory: "core" | "daemon" | "tui" | "debug";
  readonly entrypoints: ReadonlyArray<string>;
  readonly browserEntrypoints?: ReadonlyArray<string>;
}

const PACKAGE_CONFIGS: ReadonlyArray<PublicPackageConfig> = [
  { directory: "debug", entrypoints: ["src/index.ts"] },
  {
    directory: "core",
    entrypoints: [
      "src/index.ts",
      "src/hub/index.ts",
      "src/sandbox/index.ts",
      "src/strategy/index.ts",
      "src/conversation-context/index.ts",
      "src/skills/index.ts",
      "src/mcp/index.ts",
      "src/language/index.ts",
      "src/questions/index.ts",
    ],
  },
  {
    directory: "daemon",
    entrypoints: ["src/index.ts", "src/cli.ts"],
    browserEntrypoints: ["src/daemon-server/protocol.ts"],
  },
  { directory: "tui", entrypoints: ["src/index.ts", "src/main.tsx"] },
];

const requestedPackage = process.argv[2];
const packageConfig = PACKAGE_CONFIGS.find(
  ({ directory }) => directory === requestedPackage,
);
if (packageConfig === undefined) {
  throw new Error(
    `Expected a public package name: ${PACKAGE_CONFIGS.map(({ directory }) => directory).join(", ")}`,
  );
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const packageDirectory = join(
  repositoryRoot,
  "packages",
  packageConfig.directory,
);
const packageManifest = JSON.parse(
  readFileSync(join(packageDirectory, "package.json"), "utf8"),
) as {
  readonly version: string;
  readonly dependencies?: Readonly<Record<string, string>>;
};
const bundledDependencies = new Set(
  packageConfig.directory === "tui"
    ? ["ink", "ink-select-input", "ink-spinner", "ink-text-input"]
    : [],
);
const externalDependencies = Object.keys(
  packageManifest.dependencies ?? {},
).filter((dependency) => !bundledDependencies.has(dependency));
const workspaceAliases = {
  "@comma-agents/utils": join(
    repositoryRoot,
    "packages",
    "utils",
    "src",
    "index.ts",
  ),
};

rmSync(join(packageDirectory, "dist"), { recursive: true, force: true });

const entrypoints = Object.fromEntries(
  packageConfig.entrypoints.map((entrypoint) => [
    packageConfig.directory === "core"
      ? entrypoint.slice(4).replace(/\.tsx?$/, "")
      : entrypoint
          .split("/")
          .at(-1)!
          .replace(/\.tsx?$/, ""),
    join(packageDirectory, entrypoint),
  ]),
);
await build({
  input: entrypoints,
  platform: "node",
  external: (specifier) =>
    externalDependencies.some(
      (dependency) =>
        specifier === dependency || specifier.startsWith(`${dependency}/`),
    ),
  tsconfig: join(repositoryRoot, "tsconfig.json"),
  resolve: { alias: workspaceAliases },
  transform: {
    target: "node26",
    jsx: { runtime: "automatic" },
    define: {
      "process.env.COMMA_BUILD_VERSION": JSON.stringify(
        packageManifest.version,
      ),
    },
  },
  output: {
    dir: join(packageDirectory, "dist"),
    format: "esm",
    entryFileNames: "[name].js",
    sourcemap: true,
  },
});

if (packageConfig.browserEntrypoints) {
  await build({
    input: Object.fromEntries(
      packageConfig.browserEntrypoints.map((entrypoint) => [
        entrypoint.split("/").at(-1)!.replace(/\.ts$/, ""),
        join(packageDirectory, entrypoint),
      ]),
    ),
    platform: "browser",
    external: (specifier) =>
      externalDependencies.some(
        (dependency) =>
          specifier === dependency || specifier.startsWith(`${dependency}/`),
      ),
    tsconfig: join(repositoryRoot, "tsconfig.json"),
    output: {
      dir: join(packageDirectory, "dist"),
      format: "esm",
      entryFileNames: "[name].js",
    },
  });
}

if (packageConfig.directory === "daemon") {
  chmodSync(join(packageDirectory, "dist", "cli.js"), 0o755);
}
if (packageConfig.directory === "tui") {
  chmodSync(join(packageDirectory, "dist", "main.js"), 0o755);
  cpSync(
    join(packageDirectory, "node_modules", "ink", "license"),
    join(packageDirectory, "dist", "INK-LICENSE"),
  );
}

if (packageConfig.directory === "core") {
  const bundledStrategiesPath = join(packageDirectory, "strategies");
  if (existsSync(bundledStrategiesPath)) {
    cpSync(
      bundledStrategiesPath,
      join(packageDirectory, "dist", "strategies"),
      {
        recursive: true,
      },
    );
  }

  // Absolute Windows paths are not valid ESM specifiers; import a file URL.
  const { zodToJsonSchema } = await import(
    pathToFileURL(
      join(
        packageDirectory,
        "node_modules",
        "zod-to-json-schema",
        "dist",
        "esm",
        "index.js",
      ),
    ).href
  );
  const { CommaProjectManifestSchema } =
    await import("../packages/core/src/hub/hub.schema");
  const schema = zodToJsonSchema(CommaProjectManifestSchema, {
    name: "CommaProjectManifest",
    $refStrategy: "root",
  });
  writeFileSync(
    join(packageDirectory, "dist", "hub", "comma-project.schema.json"),
    `${JSON.stringify(schema, null, 2)}\n`,
  );
}

if (packageConfig.directory !== "debug") {
  const declarationResult = spawnSync(
    process.execPath,
    [
      join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"),
      "--project",
      join(packageDirectory, "tsconfig.publish.json"),
    ],
    { cwd: repositoryRoot, stdio: "inherit" },
  );
  if (declarationResult.status !== 0) {
    throw new Error(
      `Declaration build failed for @comma-agents/${packageConfig.directory}`,
    );
  }
}
