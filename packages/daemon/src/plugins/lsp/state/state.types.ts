import type { LanguageProcessEntry } from "../process/process.types";
import type { LspRunResources } from "../run-resources/run-resources.types";

/** @internal Private execution handles and per-cwd subprocesses. */
export interface LspContext {
  readonly runs: Map<string, LspRunResources>;
  readonly processes: Map<string, LanguageProcessEntry>;
  disposed: boolean;
}
