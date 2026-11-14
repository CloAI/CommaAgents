import "./styles/global.scss";

export { App } from "./App";
export type { AppProps } from "./App";
export { HostProvider, useHost } from "./hooks/useHost";
export type {
  DesktopSettings,
  DesktopSettingsPatch,
  HostCapabilities,
  HostDesktopSettings,
  HostSocket,
  HostWorkspace,
  WorkspaceSnapshot,
  WorkspaceCommand,
} from "./hooks/useHost";
export { useFocusedPaneTitle } from "./hooks/useFocusedPaneTitle";
export { Slider } from "./design-system/Slider";
export type { SliderProps } from "./design-system/Slider";
