import { expect } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ShellUseRunOptions {
  readonly sessionName?: string;
  readonly timeoutMs?: number;
  readonly cwd?: string;
}

export interface ShellUseRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface ShellUseJsonEnvelope {
  readonly ok?: boolean;
  readonly data?: unknown;
  readonly message?: string;
  readonly kind?: string;
}

export interface StartTuiSessionOptions {
  readonly sessionName: string;
  readonly workspaceDir: string;
  readonly daemonUrl: string;
  readonly strategy?: string;
  readonly input?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly columns?: number;
  readonly rows?: number;
}

export interface TerminalSnapshotOptions {
  readonly full?: boolean;
  readonly normalize?: (text: string) => string;
}

export interface ShellUseDiagnosticsOptions {
  readonly sessionName: string;
  readonly artifactDir: string;
}

const SHELL_USE_COMMAND = "shell-use";
const TUI_ENTRYPOINT = resolve(
  import.meta.dir,
  "../../../packages/tui/src/main.tsx",
);
const RAW_KEY_SEQUENCES: Readonly<Record<string, string>> = {
  Down: "\x1b[B",
  Left: "\x1b[D",
  Right: "\x1b[C",
  Up: "\x1b[A",
};

/** Run the shell-use CLI and capture stdout/stderr for test diagnostics. */
export async function runShellUse(
  args: readonly string[],
  {
    sessionName,
    timeoutMs = 10_000,
    cwd = import.meta.dir,
  }: ShellUseRunOptions = {},
): Promise<ShellUseRunResult> {
  const command = [
    SHELL_USE_COMMAND,
    ...(sessionName ? ["--session", sessionName] : []),
    ...args,
  ];
  let subprocess: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    subprocess = Bun.spawn(command, {
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    return {
      exitCode: 127,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }

  const timeout = setTimeout(() => {
    subprocess.kill();
  }, timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ]);
  clearTimeout(timeout);

  return { exitCode, stdout, stderr };
}

export async function isShellUseAvailable(): Promise<boolean> {
  const result = await runShellUse(["usage"], { timeoutMs: 2_000 });
  return result.exitCode === 0;
}

export async function startTuiSession({
  sessionName,
  workspaceDir,
  daemonUrl,
  strategy,
  input,
  env = {},
  columns = 120,
  rows = 40,
}: StartTuiSessionOptions): Promise<void> {
  const envArgs = Object.entries(env).flatMap(([name, value]) => [
    "--env",
    `${name}=${value}`,
  ]);
  await expectShellUse(
    [
      "--json",
      "run",
      "--cols",
      String(columns),
      "--rows",
      String(rows),
      "--cwd",
      workspaceDir,
      ...envArgs,
      "bun",
      TUI_ENTRYPOINT,
      "--daemon-url",
      daemonUrl,
      ...(strategy ? ["--strategy", strategy] : []),
      ...(input ? ["--input", input] : []),
    ],
    "start TUI session",
    sessionName,
  );
}

export async function closeShellUseSession(sessionName: string): Promise<void> {
  await runShellUse(["--json", "close"], { sessionName, timeoutMs: 2_000 });
}

export async function interruptShellUseSession(
  sessionName: string,
): Promise<void> {
  await runShellUse(["--json", "press", "Ctrl+C"], {
    sessionName,
    timeoutMs: 2_000,
  });
}

export async function pressKeys(
  sessionName: string,
  keys: readonly string[],
): Promise<void> {
  for (const key of keys) {
    const rawSequence = RAW_KEY_SEQUENCES[key];
    if (rawSequence) {
      await expectShellUse(
        ["--json", "write", rawSequence],
        `press key ${key}`,
        sessionName,
      );
      continue;
    }

    await expectShellUse(
      ["--json", "press", key],
      `press key ${key}`,
      sessionName,
    );
  }
}

export async function typeText(
  sessionName: string,
  text: string,
): Promise<void> {
  await expectShellUse(["--json", "type", text], `type ${text}`, sessionName);
}

export async function clickText(
  sessionName: string,
  text: string,
): Promise<void> {
  await expectShellUse(
    ["--json", "mouse", "click", "--on-text", text],
    `click text ${JSON.stringify(text)}`,
    sessionName,
  );
}

export async function scroll(
  sessionName: string,
  direction: "up" | "down",
  amount = 3,
): Promise<void> {
  await expectShellUse(
    ["--json", "mouse", "scroll", direction, "--amount", String(amount)],
    `scroll ${direction}`,
    sessionName,
  );
}

export async function resize(
  sessionName: string,
  columns: number,
  rows: number,
): Promise<void> {
  await expectShellUse(
    ["--json", "resize", String(columns), String(rows)],
    `resize to ${columns}x${rows}`,
    sessionName,
  );
}

export async function waitIdle(
  sessionName: string,
  timeoutMs = 5_000,
): Promise<void> {
  await expectShellUse(
    ["--json", "wait", "idle", "--timeout", String(timeoutMs)],
    "wait for terminal idle",
    sessionName,
    timeoutMs + 1_000,
  );
}

export async function waitForText(
  sessionName: string,
  text: string,
  timeoutMs = 10_000,
): Promise<void> {
  const result = await runShellUse(
    ["--json", "wait", "text", text, "--full", "--timeout", String(timeoutMs)],
    { sessionName, timeoutMs: timeoutMs + 1_000 },
  );

  if (result.exitCode === 0) return;

  throw new Error(
    `shell-use did not find ${JSON.stringify(text)}.\n${formatShellUseFailure(result)}\n\nTerminal text:\n${await readShellUseText(sessionName, true)}`,
  );
}

export async function expectText(
  sessionName: string,
  text: string,
): Promise<void> {
  await expectShellUse(
    [
      "--json",
      "expect",
      "text",
      text,
      "--full",
      "--no-strict",
      "--timeout",
      "2000",
    ],
    `expect text ${JSON.stringify(text)}`,
    sessionName,
  );
}

export async function expectNoText(
  sessionName: string,
  text: string,
  { full = false }: { readonly full?: boolean } = {},
): Promise<void> {
  await expectShellUse(
    [
      "--json",
      "expect",
      "text",
      text,
      ...(full ? ["--full"] : []),
      "--no-strict",
      "--not",
      "--timeout",
      "2000",
    ],
    `expect no text ${JSON.stringify(text)}`,
    sessionName,
  );
}

export async function readShellUseText(
  sessionName: string,
  full = false,
): Promise<string> {
  const result = await runShellUse(
    ["--json", "text", ...(full ? ["--full"] : [])],
    {
      sessionName,
      timeoutMs: 2_000,
    },
  );
  if (result.exitCode !== 0) return formatShellUseFailure(result);

  const envelope = parseShellUseJson(result.stdout);
  if (typeof envelope.data === "string") return envelope.data;
  if (
    typeof envelope.data === "object" &&
    envelope.data !== null &&
    "text" in envelope.data &&
    typeof envelope.data.text === "string"
  ) {
    return envelope.data.text;
  }
  return result.stdout;
}

export async function expectTerminalSnapshot(
  sessionName: string,
  name: string,
  { full = false, normalize }: TerminalSnapshotOptions = {},
): Promise<void> {
  const text = await readShellUseText(sessionName, full);
  const normalized = normalizeTerminalText(normalize ? normalize(text) : text);
  expect(`snapshot: ${name}\n${normalized}`).toMatchSnapshot();
}

export async function captureShellUseDiagnostics({
  sessionName,
  artifactDir,
}: ShellUseDiagnosticsOptions): Promise<void> {
  mkdirSync(artifactDir, { recursive: true });
  const text = await readShellUseText(sessionName, true);
  writeFileSync(join(artifactDir, "terminal.txt"), text, "utf8");

  const state = await runShellUse(["--json", "state"], {
    sessionName,
    timeoutMs: 2_000,
  });
  writeFileSync(join(artifactDir, "state.json"), state.stdout, "utf8");

  const recording = await runShellUse(["get-recording", sessionName], {
    timeoutMs: 2_000,
  });
  if (recording.exitCode === 0) {
    writeFileSync(
      join(artifactDir, "recording.cast"),
      recording.stdout,
      "utf8",
    );
  }

  await runShellUse(["screenshot", join(artifactDir, "terminal.svg")], {
    sessionName,
    timeoutMs: 2_000,
  });
}

async function expectShellUse(
  args: readonly string[],
  action: string,
  sessionName: string,
  timeoutMs = 10_000,
): Promise<void> {
  const result = await runShellUse(args, { sessionName, timeoutMs });
  if (result.exitCode === 0) return;

  throw new Error(
    `Failed to ${action}.\n${formatShellUseFailure(result)}\n\nTerminal text:\n${await readShellUseText(sessionName, true)}`,
  );
}

function normalizeTerminalText(text: string): string {
  return text
    .replaceAll(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "<uuid>",
    )
    .replaceAll(/\/private\/var\/folders\/[^\s)]+/g, "<temp-path>")
    .replaceAll(/\/var\/folders\/[^\s)]+/g, "<temp-path>")
    .replaceAll(/comma-tui-e2e-[^\s)]+/g, "comma-tui-e2e-<id>")
    .replaceAll(/· \d+s/g, "· <elapsed>")
    .replaceAll(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, "<spinner>");
}

function formatShellUseFailure(result: ShellUseRunResult): string {
  const envelope = parseShellUseJson(result.stdout);
  const details =
    envelope.message !== undefined
      ? `${envelope.kind ?? "shell-use"}: ${envelope.message}`
      : result.stdout.trim();
  const stderr = result.stderr.trim();
  return [
    `exitCode=${result.exitCode}`,
    ...(details.length > 0 ? [`stdout=${details}`] : []),
    ...(stderr.length > 0 ? [`stderr=${stderr}`] : []),
  ].join("\n");
}

function parseShellUseJson(stdout: string): ShellUseJsonEnvelope {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as ShellUseJsonEnvelope;
    }
  } catch {
    return {};
  }
  return {};
}
