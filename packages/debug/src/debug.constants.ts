// Debug constants.

import type { ResolvedDebugOptions } from "./debug.types";

/** Default values for all debug options. */
export const DEFAULTS: ResolvedDebugOptions = {
  truncate: 0,
  breakLineAfter: 0,
  collapseNewlines: false,
  showSystemPrompt: true,
  showTokens: true,
  output: console.log,
};
