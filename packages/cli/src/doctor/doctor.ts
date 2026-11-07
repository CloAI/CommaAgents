import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getApplicationDataDirectory } from "@comma-agents/core";
import { getDaemonProcessStatus, loadDaemonConfig } from "@comma-agents/daemon";
import { buildAutostartPlan } from "../autostart";
import type {
  DoctorCheck,
  DoctorOptions,
  DoctorResult,
  DoctorStatus,
} from "./doctor.types";

function combineStatus(checks: ReadonlyArray<DoctorCheck>): DoctorStatus {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }
  return "pass";
}

function checkDataDir(dataDir: string): DoctorCheck {
  try {
    mkdirSync(dataDir, { recursive: true });
    const probePath = join(dataDir, `.comma-doctor-${crypto.randomUUID()}`);
    writeFileSync(probePath, "ok");
    unlinkSync(probePath);
    return {
      id: "data-dir",
      label: "Data directory",
      status: "pass",
      message: dataDir,
    };
  } catch (caughtError) {
    return {
      id: "data-dir",
      label: "Data directory",
      status: "fail",
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
    };
  }
}

function checkPath(pathValue: string | undefined): DoctorCheck {
  const commandDir =
    process.argv[1] !== undefined ? dirname(process.argv[1]) : undefined;
  if (commandDir !== undefined && pathValue?.includes(commandDir)) {
    return {
      id: "path",
      label: "PATH",
      status: "pass",
      message: commandDir,
    };
  }
  return {
    id: "path",
    label: "PATH",
    status: "warn",
    message: "Current comma binary directory was not found in PATH",
  };
}

function checkProviderFiles(dataDir: string): DoctorCheck {
  const credentialsPath = join(dataDir, "credentials.json");
  const providerSettingsPath = join(dataDir, "provider-settings.json");
  if (existsSync(credentialsPath) || existsSync(providerSettingsPath)) {
    return {
      id: "providers",
      label: "Providers",
      status: "pass",
      message: "Provider configuration files are present",
    };
  }
  return {
    id: "providers",
    label: "Providers",
    status: "warn",
    message: "No provider credentials or settings file found yet",
  };
}

export function runDoctor({
  dataDir = getApplicationDataDirectory(),
  pathValue = process.env.PATH,
}: DoctorOptions = {}): DoctorResult {
  const daemonStatus = getDaemonProcessStatus();
  const autostartPlan = buildAutostartPlan();
  const config = loadDaemonConfig();
  const checks: DoctorCheck[] = [
    {
      id: "runtime",
      label: "Runtime",
      status:
        Number(process.versions.node.split(".")[0]) >= 26 ? "pass" : "fail",
      message: `Node.js ${process.versions.node}${Number(process.versions.node.split(".")[0]) >= 26 ? "" : " (Node.js 26 or newer is required)"}`,
    },
    checkDataDir(dataDir),
    {
      id: "config",
      label: "Daemon config",
      status: "pass",
      message: `${config.host}:${config.port}`,
    },
    {
      id: "daemon",
      label: "Daemon",
      status: daemonStatus.running ? "pass" : "warn",
      message: daemonStatus.running
        ? `Running on ${daemonStatus.host}:${daemonStatus.port} (PID ${daemonStatus.pid})`
        : "Not running; comma will start it when launching the TUI",
    },
    {
      id: "autostart",
      label: "Autostart",
      status: autostartPlan.supported ? "pass" : "warn",
      message: autostartPlan.description,
    },
    checkPath(pathValue),
    checkProviderFiles(dataDir),
  ];

  return {
    status: combineStatus(checks),
    checks,
  };
}
