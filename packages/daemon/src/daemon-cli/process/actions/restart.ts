import {
  type DaemonProcessStartOptions,
  type DaemonProcessStartResult,
  startDaemonProcess,
  stopDaemonProcess,
} from "../..";

export async function restartDaemonProcess(
  options: DaemonProcessStartOptions = {},
): Promise<DaemonProcessStartResult> {
  await stopDaemonProcess(options);
  return startDaemonProcess(options);
}
