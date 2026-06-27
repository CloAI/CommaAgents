import { describe, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  captureShellUseDiagnostics,
  closeShellUseSession,
  interruptShellUseSession,
  isShellUseAvailable,
} from "./shell-use";

const ENABLE_TUI_E2E = process.env.COMMA_TUI_E2E === "1";
let tuiE2eLock: Promise<void> = Promise.resolve();

export const describeTuiE2e = ENABLE_TUI_E2E ? describe : describe.skip;

export interface TuiE2eStrategyFixture {
  readonly name: string;
  readonly filename?: string;
  readonly description?: string;
  readonly agentName?: string;
}

export interface TuiE2eWorkspaceOptions {
  readonly strategies: readonly TuiE2eStrategyFixture[];
  readonly homeDir?: string;
}

export interface TuiE2eWorkspace {
  readonly workspaceDir: string;
  readonly homeDir: string;
  readonly artifactDir: string;
  readonly strategyPaths: ReadonlyMap<string, string>;
  readonly env: Readonly<Record<string, string>>;
  cleanup(): void;
}

export interface TuiE2eContext {
  readonly sessionName: string;
  readonly artifactDir: string;
}

export function withTuiE2e(
  name: string,
  runTest: (context: TuiE2eContext) => Promise<void>,
  timeoutMs = 45_000,
): void {
  it(
    name,
    async () => {
      await runWithTuiE2eLock(async () => {
        await runTuiE2eTest(runTest);
      });
    },
    timeoutMs,
  );
}

async function runWithTuiE2eLock(
  runExclusiveTest: () => Promise<void>,
): Promise<void> {
  const previousLock = tuiE2eLock.catch(() => {});
  let releaseLock!: () => void;
  tuiE2eLock = previousLock.then(
    () =>
      new Promise<void>((resolve) => {
        releaseLock = resolve;
      }),
  );

  await previousLock;
  try {
    await runExclusiveTest();
  } finally {
    releaseLock();
  }
}

async function runTuiE2eTest(
  runTest: (context: TuiE2eContext) => Promise<void>,
): Promise<void> {
  if (!(await isShellUseAvailable())) {
    throw new Error(
      "shell-use is not available on PATH. Install shell-use or run without COMMA_TUI_E2E=1 to skip TUI e2e tests.",
    );
  }

  const sessionName = `comma-tui-e2e-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const artifactDir = realpathSync(
    mkdtempSync(join(tmpdir(), "comma-tui-e2e-artifacts-")),
  );
  let passed = false;

  try {
    await runTest({ sessionName, artifactDir });
    passed = true;
  } catch (error) {
    await captureShellUseDiagnostics({ sessionName, artifactDir });
    const suffix = `\n\nshell-use diagnostics: ${artifactDir}`;
    if (error instanceof Error) {
      error.message += suffix;
      throw error;
    }
    throw new Error(`${String(error)}${suffix}`);
  } finally {
    await interruptShellUseSession(sessionName);
    await closeShellUseSession(sessionName);
    if (passed) rmSync(artifactDir, { recursive: true, force: true });
  }
}

export function createTuiE2eWorkspace({
  strategies,
  homeDir,
}: TuiE2eWorkspaceOptions): TuiE2eWorkspace {
  const workspaceDir = realpathSync(
    mkdtempSync(join(tmpdir(), "comma-tui-e2e-workspace-")),
  );
  const resolvedHomeDir =
    homeDir ?? realpathSync(mkdtempSync(join(tmpdir(), "comma-tui-e2e-home-")));
  const artifactDir = join(workspaceDir, "artifacts");
  const strategiesDir = join(workspaceDir, ".comma", "strategies");
  mkdirSync(strategiesDir, { recursive: true });

  const strategyPaths = new Map<string, string>();
  strategies.forEach((strategy, strategyIndex) => {
    const agentName = strategy.agentName ?? "echo";
    const filename =
      strategy.filename ??
      `${String(strategyIndex + 1).padStart(2, "0")}-${slug(strategy.name)}.json`;
    const strategyPath = join(strategiesDir, filename);
    writeFileSync(
      strategyPath,
      JSON.stringify(
        {
          name: strategy.name,
          version: "1.0.0",
          description:
            strategy.description ?? `TUI e2e fixture for ${strategy.name}.`,
          agents: {
            [agentName]: { type: "user" },
          },
          flow: {
            type: "sequential",
            name: "main",
            steps: [{ agent: agentName }],
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    strategyPaths.set(strategy.name, strategyPath);
  });

  return {
    workspaceDir,
    homeDir: resolvedHomeDir,
    artifactDir,
    strategyPaths,
    env: {
      HOME: resolvedHomeDir,
      USERPROFILE: resolvedHomeDir,
      XDG_CACHE_HOME: join(resolvedHomeDir, ".cache"),
      XDG_CONFIG_HOME: join(resolvedHomeDir, ".config"),
      XDG_DATA_HOME: join(resolvedHomeDir, ".local", "share"),
    },
    cleanup(): void {
      rmSync(workspaceDir, { recursive: true, force: true });
      rmSync(resolvedHomeDir, { recursive: true, force: true });
    },
  };
}

export async function waitForFile(
  filePath: string,
  timeoutMs = 5_000,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await Bun.file(filePath).exists()) return;
    await Bun.sleep(50);
  }
  throw new Error(`Timed out waiting for file: ${filePath}`);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}
