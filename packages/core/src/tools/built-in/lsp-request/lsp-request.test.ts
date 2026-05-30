import { describe, expect, it } from "bun:test";
import type { LanguageService } from "../../../language";
import { makeToolContext } from "../../test.utils";
import { createLspRequestTool } from "./lsp-request";

function makeLanguageService(): LanguageService {
  return {
    languageIds: ["typescript"],
    request: async (request) => ({
      hover: {
        contents: `hover:${request.path}:${request.position?.line}:${request.position?.character}`,
      },
    }),
  };
}

describe("lsp_request", () => {
  it("returns language_unavailable when no service is provided", async () => {
    const tool = createLspRequestTool();
    const result = await tool.execute(
      {
        method: "textDocument/hover",
        path: "src/index.ts",
        line: 1,
        character: 1,
      },
      makeToolContext(),
    );

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("language_unavailable");
  });

  it("delegates LSP requests to the runtime language service", async () => {
    const tool = createLspRequestTool();
    const result = await tool.execute(
      {
        method: "textDocument/hover",
        path: "src/index.ts",
        line: 2,
        character: 3,
      },
      makeToolContext({ languageService: makeLanguageService() }),
    );

    expect(result.ok).toBe(true);
    expect(result.data?.hover?.contents).toBe("hover:src/index.ts:2:3");
  });
});
