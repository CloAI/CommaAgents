import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveDataDir } from "@comma-agents/core";
import { getDaemonStatus, loadDaemonConfig } from "@comma-agents/daemon";
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
  const providerRegistryPath = join(dataDir, "provider-registry.json");
  if (existsSync(credentialsPath) || existsSync(providerRegistryPath)) {
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
    message: "No provider credentials or registry file found yet",
  };
}

export function runDoctor({
  dataDir = resolveDataDir(),
  pathValue = process.env.PATH,
}: DoctorOptions = {}): DoctorResult {
  const daemonStatus = getDaemonStatus();
  const autostartPlan = buildAutostartPlan();
  const config = loadDaemonConfig();
  const checks: DoctorCheck[] = [
    {
      id: "runtime",
      label: "Runtime",
      status: process.versions.bun ? "pass" : "fail",
      message: process.versions.bun
        ? `Bun ${process.versions.bun}`
        : "Bun runtime is required",
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
