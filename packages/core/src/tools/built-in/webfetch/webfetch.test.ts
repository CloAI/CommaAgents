import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { makeToolContext } from "../../test.utils";
import { createWebFetchTool } from "./index";

const toolContext = makeToolContext({ abort: AbortSignal.timeout(15_000) });

// Lightweight local HTTP server for deterministic tests.
let server: ReturnType<typeof Bun.serve> | undefined;
let baseUrl = "";

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/html") {
        return new Response(
          "<html><body><h1>Hello</h1><p>World <strong>bold</strong></p></body></html>",
          { headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }
      if (url.pathname === "/large") {
        const big = `<p>${"x".repeat(200)}</p>`;
        return new Response(`<html><body>${big.repeat(500)}</body></html>`, {
          headers: { "content-type": "text/html" },
        });
      }
      if (url.pathname === "/notfound") {
        return new Response("<html><body>missing</body></html>", {
          status: 404,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server?.stop(true);
});

describe("createWebFetchTool", () => {
  it("should create a tool with correct description and parameters", () => {
    const tool = createWebFetchTool();
    expect(tool.description).toContain("Fetch");
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });

  it("should fetch a URL and convert HTML to markdown by default", async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute(
      { url: `${baseUrl}/html`, format: "markdown" },
      toolContext,
    );
    expect(result.output).toContain("Hello");
    expect(result.output).toContain("**bold**");
    expect(result.metadata?.statusCode).toBe(200);
    expect(result.metadata?.format).toBe("markdown");
  });

  it("should return plain text when format is 'text'", async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute(
      { url: `${baseUrl}/html`, format: "text" },
      toolContext,
    );
    expect(result.output).toContain("Hello");
    expect(result.output).not.toContain("**");
    expect(result.output).not.toContain("<h1>");
  });

  it("should return raw HTML when format is 'html'", async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute(
      { url: `${baseUrl}/html`, format: "html" },
      toolContext,
    );
    expect(result.output).toContain("<h1>Hello</h1>");
    expect(result.output).toContain("<strong>bold</strong>");
  });

  it("should truncate content beyond maxContentLength", async () => {
    const tool = createWebFetchTool({ maxContentLength: 200 });
    const result = await tool.execute(
      { url: `${baseUrl}/large`, format: "markdown" },
      toolContext,
    );
    expect(result.metadata?.truncated).toBe(true);
    expect(result.output).toContain("[Content truncated");
  });

  it("should include HTTP status header for non-OK responses", async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute(
      { url: `${baseUrl}/notfound`, format: "markdown" },
      toolContext,
    );
    expect(result.output).toContain("[HTTP 404");
    expect(result.metadata?.statusCode).toBe(404);
  });

  it("should reject invalid URLs at parameter validation time", () => {
    const tool = createWebFetchTool();
    expect(() => tool.parameters.parse({ url: "not-a-url" })).toThrow();
  });
});
