import { z } from "zod";

export const lspRequestParams = z.object({
  method: z.enum([
    "textDocument/diagnostic",
    "textDocument/hover",
    "textDocument/definition",
    "textDocument/typeDefinition",
    "textDocument/implementation",
    "textDocument/references",
    "textDocument/documentSymbol",
    "workspace/symbol",
  ]),
  languageId: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  line: z.number().int().positive().optional(),
  character: z.number().int().positive().optional(),
  query: z.string().min(1).optional(),
});
