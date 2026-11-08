import type { DesktopBridge } from "../shared/ipc";

/**
 * Read the operating system the window runs on, to adapt its chrome.
 * @returns {DesktopBridge["platform"]} "darwin", "win32" or "linux".
 */
export function usePlatform(): DesktopBridge["platform"] {
  return window.commaDesktop.platform;
}
