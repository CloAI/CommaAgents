import { createPlugin } from "../../daemon-plugin";
import { createLspContext, getLspStatus } from "./state";
import { prepareRunLsp, requestRunLsp, disposeLsp } from "./run-resources";
import type { CreateLspPluginOptions, LspPlugin } from "./lsp.types";

/**
 * Supply lazy, shared per-cwd TypeScript subprocesses to run language tools.
 * @param {CreateLspPluginOptions} options - Runs plugin dependency.
 * @returns {LspPlugin} Language queries, process status, and resource cleanup.
 * @example
 * const lsp = createLspPlugin({ dependencies: { runs } });
 * const result = await lsp.request(runId, { method: "textDocument/diagnostic", path: "src/index.ts" });
 */
export function createLspPlugin({
  dependencies,
}: CreateLspPluginOptions): LspPlugin {
  const context = createLspContext();
  const plugin = createPlugin({
    name: "lsp",
    cleanup: () => disposeLsp(context),
  });
  dependencies.runs.registerRunPreparation({
    name: "lsp",
    prepare: (preparation) => prepareRunLsp(context, preparation),
  });
  dependencies.runs.registerStrategyHooks({
    name: "lsp",
    attach(strategyContext): void {
      for (const agent of Object.values(strategyContext.strategy.agents)) {
        agent.appendHook?.(
          "afterToolCall",
          ({ name }: { readonly name: string }): void => {
            if (
              [
                "create_file",
                "write_file",
                "edit_file",
                "delete_file",
                "move_file",
                "apply_patch",
                "restore_file",
              ].includes(name)
            ) {
              context.runs
                .get(strategyContext.runId)
                ?.process?.backend?.invalidate();
            }
          },
        );
      }
    },
  });
  return {
    ...plugin,
    request: (runId, request, signal) =>
      requestRunLsp(context, runId, request, signal),
    getStatus: (cwd) => getLspStatus(context, cwd),
  };
}
