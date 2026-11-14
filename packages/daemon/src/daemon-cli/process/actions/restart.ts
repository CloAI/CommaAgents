import {
  type DaemonProcessStartOptions,
  type DaemonProcessStartResult,
  startDaemonProcess,
  stopDaemonProcess,
} from "../..";
import { loadDaemonConfig } from "../../../config";
import {
  buildDaemonProcessEnvOverrides,
  validateDaemonConsoleOptions,
} from "../process.utils";

export async function restartDaemonProcess(
  options: DaemonProcessStartOptions = {},
): Promise<DaemonProcessStartResult> {
  validateDaemonConsoleOptions(options);
  loadDaemonConfig({ env: buildDaemonProcessEnvOverrides(options) });
  await stopDaemonProcess(options);
  return startDaemonProcess(options);
}
