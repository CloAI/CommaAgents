import type { TypeScriptBackend } from "../languages/typescript/typescript.types";
import type { LspProcessPhase } from "../lsp.types";

/** @internal Shared subprocess and the executions retaining it. */
export interface LanguageProcessEntry {
  readonly cwd: string;
  readonly runIds: Set<string>;
  phase: LspProcessPhase;
  backend?: TypeScriptBackend;
  startup?: Promise<TypeScriptBackend>;
  recovery?: Promise<void>;
  closing?: Promise<void>;
  recoveryUsed: boolean;
  error?: string;
}
