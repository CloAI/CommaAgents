import type { DesktopBridge } from "../shared/ipc";

declare global {
  interface Window {
    /** Exposed by the preload script. */
    readonly commaDesktop: DesktopBridge;
  }
}
