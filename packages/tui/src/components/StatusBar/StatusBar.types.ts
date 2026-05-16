import type { RefObject } from "react";
import type { ChatStatus } from "../../hooks/useChat/useChat.types";
import type { StatusBarTheme } from "./StatusBar.theme";

/**
 * Props for {@link StatusBar}.
 */
export interface StatusBarProps {
  readonly status: ChatStatus;
  readonly error: string | null;
  readonly strategyName?: string;
}

/**
 * Props for {@link StatusBarRender}.
 *
 * Pure render props — all hook-derived values are computed by the
 * container and passed down.
 */
export interface StatusBarRenderProps {
  readonly status: ChatStatus;
  readonly error: string | null;
  readonly strategyName?: string;
  readonly theme: StatusBarTheme;
  readonly debugRef: RefObject<unknown>;
}
