import { startDaemon } from "@comma-agents/daemon";
import { offerUpdateBeforeTui } from "../update";
import type { LaunchTuiOptions } from "./tui.types";
import { resolveSelfDaemonCommand } from "./tui.utils";

export async function launchTui(
  options: LaunchTuiOptions = {},
): Promise<number> {
  if (await offerUpdateBeforeTui()) return 0;

  await startDaemon({
    allowExisting: true,
    foregroundCommand: options.daemonCommand ?? resolveSelfDaemonCommand(),
    readinessTimeoutMs: options.readinessTimeoutMs ?? 5000,
  });

  const { runTui } = await import("@comma-agents/tui");
  const tuiInstance = runTui(options);
  await tuiInstance.waitUntilExit();
  return 0;
}
