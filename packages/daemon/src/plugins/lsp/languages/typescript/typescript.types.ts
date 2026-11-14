import type { LspRequest, LspResponse } from "@comma-agents/core/language";
import type { CompilerOptions } from "typescript";
import type { TypeScriptTransport } from "../../transport/transport.types";

/** @internal Root project configuration and saved source files. */
export interface TypeScriptProject {
  readonly fileNames: readonly string[];
  readonly options: CompilerOptions;
}

/** @internal TypeScript-specific synchronization and protocol translation. */
export interface TypeScriptBackend {
  readonly transport: TypeScriptTransport;
  request(request: LspRequest, signal: AbortSignal): Promise<LspResponse>;
  invalidate(): void;
}
