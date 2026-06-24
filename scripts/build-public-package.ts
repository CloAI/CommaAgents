import { chmodSync, cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface PublicPackageConfig {
  readonly directory: "core" | "daemon" | "tui";
  readonly entrypoints: ReadonlyArray<string>;
}

const PACKAGE_CONFIGS: ReadonlyArray<PublicPackageConfig> = [
  { directory: "core", entrypoints: ["src/index.ts", "src/hub/index.ts"] },
  { directory: "daemon", entrypoints: ["src/index.ts", "src/cli.ts"] },
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

const repositoryRoot = resolve(import.meta.dir, "..");
const packageDirectory = join(
  repositoryRoot,
  "packages",
  packageConfig.directory,
);
const packageManifest = (await Bun.file(
  join(packageDirectory, "package.json"),
).json()) as {
  readonly version: string;
  readonly dependencies?: Readonly<Record<string, string>>;
};
const externalDependencies = Object.keys(packageManifest.dependencies ?? {});
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

const buildResult = await Bun.build({
  entrypoints: packageConfig.entrypoints.map((entrypoint) =>
    join(packageDirectory, entrypoint),
  ),
  outdir: join(packageDirectory, "dist"),
  naming:
    packageConfig.directory === "core" ? "[dir]/[name].js" : "[name].js",
  target: "bun",
  external: externalDependencies,
  alias: workspaceAliases,
  define: {
    "process.env.COMMA_BUILD_VERSION": JSON.stringify(packageManifest.version),
  },
});

if (!buildResult.success) {
  throw new AggregateError(
    buildResult.logs,
    `Failed to build @comma-agents/${packageConfig.directory}`,
  );
}

if (packageConfig.directory === "daemon") {
  chmodSync(join(packageDirectory, "dist", "cli.js"), 0o755);
}
if (packageConfig.directory === "tui") {
  chmodSync(join(packageDirectory, "dist", "main.js"), 0o755);
}

if (packageConfig.directory === "core") {
  const bundledStrategiesPath = join(packageDirectory, "strategies");
  if (existsSync(bundledStrategiesPath)) {
    cpSync(bundledStrategiesPath, join(packageDirectory, "dist", "strategies"), {
      recursive: true,
    });
  }

  const { zodToJsonSchema } = await import(
    join(
      packageDirectory,
      "node_modules",
      "zod-to-json-schema",
      "dist",
      "esm",
      "index.js",
    )
  );
  const { CommaProjectManifestSchema } = await import(
    "../packages/core/src/hub/hub.schema"
  );
  const schema = zodToJsonSchema(CommaProjectManifestSchema, {
    name: "CommaProjectManifest",
    $refStrategy: "root",
  });
  writeFileSync(
    join(packageDirectory, "dist", "hub", "comma-project.schema.json"),
    `${JSON.stringify(schema, null, 2)}\n`,
  );
}

const declarationResult = Bun.spawnSync(
  [
    join(repositoryRoot, "node_modules", ".bin", "tsc"),
    "--project",
    join(packageDirectory, "tsconfig.publish.json"),
  ],
  { cwd: repositoryRoot, stdout: "inherit", stderr: "inherit" },
);
if (declarationResult.exitCode !== 0) {
  throw new Error(
    `Declaration build failed for @comma-agents/${packageConfig.directory}`,
  );
}
