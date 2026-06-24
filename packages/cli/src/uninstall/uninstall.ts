import { readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";

import { resolveDataDir } from "@comma-agents/core";
import { stopDaemon } from "@comma-agents/daemon";

import { buildAutostartPlan, disableAutostart } from "../autostart";
import type {
  CommaInstallation,
  RunUninstallerOptions,
  UninstallResult,
  UninstallSelections,
} from "./uninstall.types";
import {
  removeSelectedData,
  resolveCommaInstallation,
} from "./uninstall.utils";

async function promptForConfirmation(
  terminal: ReturnType<typeof createInterface>,
  prompt: string,
  defaultValue: boolean,
): Promise<boolean> {
  const suffix = defaultValue ? "[Y/n]" : "[y/N]";
  const answer = (await terminal.question(`${prompt} ${suffix} `))
    .trim()
    .toLowerCase();
  if (answer.length === 0) return defaultValue;
  return answer === "y" || answer === "yes";
}

async function resolveSelections(
  options: RunUninstallerOptions,
): Promise<UninstallSelections | undefined> {
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  const terminal = interactive
    ? createInterface({
        input: process.stdin,
        output: process.stdout,
      })
    : undefined;
  try {
    if (!options.confirmed) {
      if (terminal === undefined) {
        throw new Error(
          "Non-interactive uninstall requires --yes. Data removal flags default to false.",
        );
      }
      if (
        !(await promptForConfirmation(
          terminal,
          "Uninstall CommaAgents from this system?",
          false,
        ))
      ) {
        return undefined;
      }
    }

    return {
      removeHistory:
        options.removeHistory ??
        (terminal !== undefined
          ? await promptForConfirmation(
              terminal,
              "Remove conversation history?",
              false,
            )
          : false),
      removePackages:
        options.removePackages ??
        (terminal !== undefined
          ? await promptForConfirmation(
              terminal,
              "Remove installed Hub and provider packages?",
              false,
            )
          : false),
      removeConfig:
        options.removeConfig ??
        (terminal !== undefined
          ? await promptForConfirmation(
              terminal,
              "Remove credentials, config, logs, trash, global skills, and strategies?",
              false,
            )
          : false),
    };
  } finally {
    terminal?.close();
  }
}

async function removeAutostart(warnings: string[]): Promise<void> {
  const plan = buildAutostartPlan();
  try {
    await disableAutostart();
  } catch (caughtError) {
    warnings.push(
      `Could not disable ${plan.description}: ${
        caughtError instanceof Error ? caughtError.message : String(caughtError)
      }`,
    );
  }

  await Promise.all(
    plan.enableActions
      .filter((action) => action.type === "write-file")
      .map((action) => rm(action.path, { force: true })),
  );
}

async function removeManagedUnixPathEntry(
  executablePath: string,
  warnings: string[],
): Promise<void> {
  if (
    process.platform === "win32" ||
    dirname(executablePath) !== join(homedir(), ".local", "bin")
  ) {
    return;
  }

  const managedLine = 'export PATH="$HOME/.local/bin:$PATH"';
  const shellFiles = [".zshrc", ".bashrc", ".bash_profile", ".profile"];
  await Promise.all(
    shellFiles.map(async (shellFile) => {
      const shellPath = join(homedir(), shellFile);
      try {
        const lines = (await readFile(shellPath, "utf8")).split("\n");
        const markerIndex = lines.findIndex(
          (line, lineIndex) =>
            line === "# CommaAgents CLI" &&
            lines[lineIndex + 1] === managedLine,
        );
        if (markerIndex === -1) return;
        lines.splice(markerIndex, 2);
        if (markerIndex > 0 && lines[markerIndex - 1] === "") {
          lines.splice(markerIndex - 1, 1);
        }
        await writeFile(shellPath, lines.join("\n"));
      } catch (caughtError) {
        if ((caughtError as NodeJS.ErrnoException).code === "ENOENT") return;
        warnings.push(
          `Could not update ${shellPath}: ${
            caughtError instanceof Error
              ? caughtError.message
              : String(caughtError)
          }`,
        );
      }
    }),
  );
}

function scheduleUnixRemoval(installation: CommaInstallation): boolean {
  const removalCommand =
    installation.type === "standalone"
      ? ["rm", "-f", "--", installation.executablePath]
      : installation.type === "package"
        ? installation.command
        : undefined;
  if (removalCommand === undefined) return false;

  const script = [
    'while kill -0 "$1" 2>/dev/null; do sleep 0.1; done',
    "shift",
    'exec "$@"',
  ].join("\n");
  const child = Bun.spawn(
    [
      "sh",
      "-c",
      script,
      "comma-uninstall",
      String(process.pid),
      ...removalCommand,
    ],
    {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: true,
    },
  );
  child.unref();
  return true;
}

async function scheduleWindowsRemoval(
  installation: CommaInstallation,
): Promise<boolean> {
  if (installation.type === "development") return false;

  const scriptPath = join(
    tmpdir(),
    `comma-uninstall-${crypto.randomUUID()}.ps1`,
  );
  const script = `param(
  [int]$ParentProcessId,
  [string]$RemovalType,
  [string]$Target
)

Wait-Process -Id $ParentProcessId -ErrorAction SilentlyContinue
if ($RemovalType -eq "standalone") {
  Remove-Item -LiteralPath $Target -Force -ErrorAction SilentlyContinue
  $installDirectory = Split-Path -Parent $Target
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath) {
    $remainingPaths = @($userPath -split ";" | Where-Object {
      $_ -and $_.TrimEnd("\\") -ne $installDirectory.TrimEnd("\\")
    })
    [Environment]::SetEnvironmentVariable("Path", ($remainingPaths -join ";"), "User")
  }
} else {
  $command = ConvertFrom-Json $env:COMMA_UNINSTALL_COMMAND
  $commandName = $command[0]
  $commandArguments = @($command | Select-Object -Skip 1)
  & $commandName @commandArguments
}
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
`;
  await writeFile(scriptPath, script);

  const command =
    installation.type === "package" ? installation.command : undefined;
  const child = Bun.spawn(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-ParentProcessId",
      String(process.pid),
      "-RemovalType",
      installation.type,
      "-Target",
      installation.type === "standalone"
        ? installation.executablePath
        : (command?.[0] ?? ""),
    ],
    {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: true,
      env: {
        ...process.env,
        COMMA_UNINSTALL_COMMAND: JSON.stringify(command ?? []),
      },
    },
  );
  child.unref();
  return true;
}

async function scheduleInstallationRemoval(
  installation: CommaInstallation,
): Promise<boolean> {
  if (process.platform === "win32") {
    return scheduleWindowsRemoval(installation);
  }
  return scheduleUnixRemoval(installation);
}

/**
 * Uninstall the running CommaAgents CLI and optionally remove persisted user data.
 *
 * @param options - Confirmation and selective data-removal choices.
 * @example
 * ```ts
 * await runUninstaller({ confirmed: true, removeHistory: true });
 * ```
 */
export async function runUninstaller(
  options: RunUninstallerOptions = {},
): Promise<UninstallResult> {
  const selections = await resolveSelections(options);
  if (selections === undefined) {
    console.log("Uninstall cancelled.");
    return {
      uninstalled: false,
      selections: undefined,
      warnings: [],
      installation: undefined,
    };
  }

  const warnings: string[] = [];
  await removeAutostart(warnings);
  try {
    const stopResult = await stopDaemon();
    if (stopResult.stopped) console.log(stopResult.message);
  } catch (caughtError) {
    throw new Error(
      `Uninstall stopped before removing data because the daemon could not be stopped: ${
        caughtError instanceof Error ? caughtError.message : String(caughtError)
      }`,
    );
  }

  await removeSelectedData(resolveDataDir(), selections);

  const installation = resolveCommaInstallation({
    standaloneBuild: process.env.COMMA_STANDALONE_BUILD === "1",
    executablePath: process.execPath,
    cliEntrypoint: process.argv[1],
  });
  if (installation.type === "standalone") {
    await removeManagedUnixPathEntry(installation.executablePath, warnings);
  }

  const removalScheduled = await scheduleInstallationRemoval(installation);
  if (!removalScheduled) {
    warnings.push(
      "The CLI is running from a development checkout, so no global package or executable was removed.",
    );
  }

  for (const warning of warnings) console.warn(`Warning: ${warning}`);
  console.log(
    removalScheduled
      ? "CommaAgents will finish uninstalling after this command exits."
      : "CommaAgents user services and selected data were removed.",
  );
  return {
    uninstalled: removalScheduled,
    selections,
    warnings,
    installation,
  };
}
