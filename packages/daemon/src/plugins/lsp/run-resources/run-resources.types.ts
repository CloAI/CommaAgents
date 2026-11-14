import type { LanguageProcessEntry } from "../process/process.types";

/** @internal Execution-owned language handle and subprocess reference, acquired on first query. */
export interface LspRunResources {
  readonly runId: string;
  readonly cwd: string;
  readonly controller: AbortController;
  readonly detachAbort: () => void;
  process?: LanguageProcessEntry;
  disposal?: Promise<void>;
  disposed: boolean;
}
