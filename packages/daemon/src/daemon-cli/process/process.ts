import type {
  DaemonCommandAction,
  DaemonCommandArguments,
  DaemonCommandOptions,
} from "../command";
import { restartDaemonProcess } from "./actions/restart";
import { startDaemonProcess } from "./actions/start";
import { stopDaemonProcess } from "./actions/stop";
import {
  buildStartOptions,
  printDaemonLogPath,
  printDaemonProcessStatus,
} from "./process.utils";

export async function processDaemonCommand(
  action: DaemonCommandAction,
  commandArguments: DaemonCommandArguments,
  options: DaemonCommandOptions = {},
): Promise<void> {
  const startOptions = buildStartOptions(commandArguments, options);

  switch (action) {
    case "start": {
      const result = await startDaemonProcess(startOptions);
      if (startOptions.foreground !== true) {
        console.log(result.message);
      }
      return;
    }
    case "stop": {
      const result = await stopDaemonProcess();
      console.log(result.message);
      return;
    }
    case "restart": {
      const result = await restartDaemonProcess(startOptions,
      );
      console.log(result.message);
      return;
    }
    case "status":
      printDaemonProcessStatus(commandArguments.json === true);
      return;
    case "logs":
      printDaemonLogPath();
      return;
  }
}
