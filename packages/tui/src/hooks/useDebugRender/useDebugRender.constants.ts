import type { RenderReason } from "./useDebugRender.types";

/** How long the colored highlight stays visible before being cleared. */
export const FLASH_DURATION_MS = 200;

/** ANSI reset sequence. */
export const ANSI_RESET = "\x1b[0m";

/** ANSI SGR foreground color codes for the border outline. */
export const DEFAULT_BG_COLORS: Record<RenderReason, string> = {
  mount: "\x1b[36m",
  unmount: "\x1b[31m",
  props: "\x1b[35m",
  state: "\x1b[32m",
  context: "\x1b[37m",
  rerender: "\x1b[33m",
};

/** ANSI SGR codes for each label pill (background + contrasting foreground). */
export const DEFAULT_LABEL_COLORS: Record<RenderReason, string> = {
  mount: "\x1b[46;30m",
  unmount: "\x1b[41;37m",
  props: "\x1b[45;37m",
  state: "\x1b[42;30m",
  context: "\x1b[47;30m",
  rerender: "\x1b[43;30m",
};

/** Unicode box-drawing characters for the border outline. */
export const BORDER_CHARS = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
} as const;
