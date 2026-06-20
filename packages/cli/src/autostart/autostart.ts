import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AutostartAction,
  AutostartInstallOptions,
  AutostartPlan,
} from "./autostart.types";
import {
  buildLaunchdPath,
  buildLaunchdPlist,
  buildSystemdPath,
  buildSystemdUnit,
  quoteWindowsCommand,
  resolveCommaPath,
} from "./autostart.utils";

async function runAction(action: AutostartAction): Promise<void> {
  if (action.type === "write-file") {
    mkdirSync(dirname(action.path), { recursive: true });
    writeFileSync(action.path, action.content);
    return;
  }

  const [command, ...commandArguments] = action.command;
  if (command === undefined) {
    throw new Error("Autostart command is empty");
  }
  const processResult = Bun.spawnSync([command, ...commandArguments], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (processResult.exitCode !== 0) {
    throw new Error(
      new TextDecoder().decode(processResult.stderr).trim() ||
        `${command} exited with ${processResult.exitCode}`,
    );
  }
}

export function buildAutostartPlan({
  platform = process.platform,
  commaPath,
  homeDir,
  xdgConfigHome,
}: AutostartInstallOptions = {}): AutostartPlan {
  const resolvedCommaPath = resolveCommaPath(commaPath);

  if (platform === "darwin") {
    const launchdPath = buildLaunchdPath(homeDir);
    return {
      platform,
      supported: true,
      description: "macOS launchd user agent",
      enableActions: [
        {
          type: "write-file",
          path: launchdPath,
          content: buildLaunchdPlist(resolvedCommaPath),
        },
        {
          type: "run-command",
          command: ["launchctl", "load", "-w", launchdPath],
        },
      ],
      disableActions: [
        {
          type: "run-command",
          command: ["launchctl", "unload", "-w", launchdPath],
        },
      ],
    };
  }

  if (platform === "linux") {
    const systemdPath = buildSystemdPath(homeDir, xdgConfigHome);
    return {
      platform,
      supported: true,
      description: "systemd user service",
      enableActions: [
        {
          type: "write-file",
          path: systemdPath,
          content: buildSystemdUnit(resolvedCommaPath),
        },
        {
          type: "run-command",
          command: ["systemctl", "--user", "daemon-reload"],
        },
        {
          type: "run-command",
          command: [
            "systemctl",
            "--user",
            "enable",
            "--now",
            "comma-agents.service",
          ],
        },
      ],
      disableActions: [
        {
          type: "run-command",
          command: [
            "systemctl",
            "--user",
            "disable",
            "--now",
            "comma-agents.service",
          ],
        },
      ],
    };
  }

  if (platform === "win32") {
    return {
      platform,
      supported: true,
      description: "Windows user logon scheduled task",
      enableActions: [
        {
          type: "run-command",
          command: [
            "schtasks",
            "/Create",
            "/TN",
            "CommaAgentsDaemon",
            "/SC",
            "ONLOGON",
            "/TR",
            quoteWindowsCommand(resolvedCommaPath),
            "/F",
          ],
        },
      ],
      disableActions: [
        {
          type: "run-command",
          command: ["schtasks", "/Delete", "/TN", "CommaAgentsDaemon", "/F"],
        },
      ],
    };
  }

  return {
    platform,
    supported: false,
    description: "Lazy daemon startup only",
    enableActions: [],
    disableActions: [],
  };
}

export async function enableAutostart(
  options: AutostartInstallOptions = {},
): Promise<AutostartPlan> {
  const plan = buildAutostartPlan(options);
  if (!plan.supported) {
    throw new Error(`Daemon autostart is not supported on ${plan.platform}`);
  }
  for (const action of plan.enableActions) {
    await runAction(action);
  }
  return plan;
}

export async function disableAutostart(
  options: AutostartInstallOptions = {},
): Promise<AutostartPlan> {
  const plan = buildAutostartPlan(options);
  if (!plan.supported) {
    return plan;
  }
  for (const action of plan.disableActions) {
    await runAction(action);
  }
  for (const action of plan.enableActions) {
    if (action.type === "write-file") {
      rmSync(action.path, { force: true });
    }
  }
  return plan;
}
