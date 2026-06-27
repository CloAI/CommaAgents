import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  LanguageService,
  LspRequest,
  LspResponse,
} from "@comma-agents/core";
import * as ts from "typescript";
import { createTypeScriptLanguageService } from "./typescript-service";

export interface CreateWorkspaceLanguageServiceOptions {
  readonly workspaceRoot: string;
}

interface LanguageAdapter {
  readonly languageId: string;
  readonly extensions: readonly string[];
  detect(workspaceRoot: string): boolean;
  create(workspaceRoot: string): LanguageService;
}

const ADAPTERS: readonly LanguageAdapter[] = [
  {
    languageId: "typescript",
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    detect: hasTypeScriptProject,
    create: (workspaceRoot) =>
      createTypeScriptLanguageService({ workspaceRoot }),
  },
];

export function createWorkspaceLanguageService(
  options: CreateWorkspaceLanguageServiceOptions,
): LanguageService | undefined {
  const adapters = ADAPTERS.filter((adapter) =>
    adapter.detect(options.workspaceRoot),
  );
  if (adapters.length === 0) return undefined;

  const services = adapters.map((adapter) => ({
    adapter,
    service: adapter.create(options.workspaceRoot),
  }));

  return {
    languageIds: services.map(({ adapter }) => adapter.languageId),
    async request(
      request: LspRequest,
      signal?: AbortSignal,
    ): Promise<LspResponse> {
      const selected =
        services.find(
          ({ adapter }) => adapter.languageId === request.languageId,
        ) ??
        services.find(({ adapter }) =>
          request.path
            ? adapter.extensions.some((extension) =>
                request.path?.endsWith(extension),
              )
            : false,
        ) ??
        services[0];

      if (!selected) {
        throw new Error("No language service available for request");
      }

      return await selected.service.request(request, signal);
    },
  };
}

function hasTypeScriptProject(workspaceRoot: string): boolean {
  if (
    existsSync(join(workspaceRoot, "tsconfig.json")) ||
    existsSync(join(workspaceRoot, "jsconfig.json"))
  ) {
    return true;
  }

  const packageJsonPath = join(workspaceRoot, "package.json");
  if (existsSync(packageJsonPath)) return true;

  return (
    ts.sys.readDirectory(
      workspaceRoot,
      [".ts", ".tsx", ".js", ".jsx"],
      ["node_modules", "dist", "build", ".git"],
      undefined,
      1,
    ).length > 0
  );
}
