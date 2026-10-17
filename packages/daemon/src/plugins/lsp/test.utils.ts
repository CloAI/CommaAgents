import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LanguageService } from "@comma-agents/core/language";
import {
  createMockRunsPlugin,
  directories,
  fakeLoader,
  repository,
} from "../runs/test.utils";
import { createLspPlugin } from "./lsp";

/**
 * Create runs with a real LSP plugin and captured tool-facing service handles.
 * @returns {object} Run service, plugin, source helpers, and captured handles.
 */
export function createLspFixture() {
  const services = new Map<string, LanguageService>();
  const loader = fakeLoader({ loads: [], restored: [] });
  const runs = createMockRunsPlugin({
    repository: repository(),
    async loadStrategy(options) {
      const service = options.strategyInputs.languageService;
      if (!service) {
        throw new Error("Language service was not supplied");
      }
      services.set(options.runId, service);
      return loader(options);
    },
  });
  const lsp = createLspPlugin({ dependencies: { runs } });
  const cwd = directories.at(-1)!;
  async function writeSource(path: string, content: string): Promise<void> {
    const file = join(cwd, path);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, content);
  }
  return { runs, lsp, cwd, services, writeSource };
}
