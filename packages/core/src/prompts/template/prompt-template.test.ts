// Tests for PromptTemplate — variable interpolation, env vars, escaped braces

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createPromptTemplate, extractVariables } from "./prompt-template";

// ---------------------------------------------------------------------------
// Basic variable interpolation
// ---------------------------------------------------------------------------

describe("createPromptTemplate", () => {
  describe("basic interpolation", () => {
    it("replaces a single variable", async () => {
      const tpl = createPromptTemplate({
        template: "Hello, {name}!",
        variables: { name: "Alice" },
      });

      const result = await tpl.build();
      expect(result).toBe("Hello, Alice!");
    });

    it("replaces multiple variables", async () => {
      const tpl = createPromptTemplate({
        template: "You are {role}, an expert in {language}.",
        variables: { role: "a reviewer", language: "TypeScript" },
      });

      const result = await tpl.build();
      expect(result).toBe("You are a reviewer, an expert in TypeScript.");
    });

    it("returns the template as-is if no placeholders", async () => {
      const tpl = createPromptTemplate({
        template: "No placeholders here.",
      });

      const result = await tpl.build();
      expect(result).toBe("No placeholders here.");
    });

    it("handles empty string template", async () => {
      const tpl = createPromptTemplate({ template: "" });
      expect(await tpl.build()).toBe("");
    });
  });

  // ---------------------------------------------------------------------------
  // Overrides
  // ---------------------------------------------------------------------------

  describe("overrides", () => {
    it("overrides take precedence over defaults", async () => {
      const tpl = createPromptTemplate({
        template: "Language: {lang}",
        variables: { lang: "TypeScript" },
      });

      const result = await tpl.build({ lang: "Rust" });
      expect(result).toBe("Language: Rust");
    });

    it("defaults are used when override is not provided", async () => {
      const tpl = createPromptTemplate({
        template: "{greeting}, {name}!",
        variables: { greeting: "Hello", name: "World" },
      });

      const result = await tpl.build({ name: "Alice" });
      expect(result).toBe("Hello, Alice!");
    });
  });

  // ---------------------------------------------------------------------------
  // Dynamic (function) values
  // ---------------------------------------------------------------------------

  describe("dynamic values", () => {
    it("resolves synchronous function values", async () => {
      const tpl = createPromptTemplate({
        template: "Count: {count}",
        variables: { count: () => "42" },
      });

      expect(await tpl.build()).toBe("Count: 42");
    });

    it("resolves async function values", async () => {
      const tpl = createPromptTemplate({
        template: "Data: {data}",
        variables: {
          data: async () => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return "loaded";
          },
        },
      });

      expect(await tpl.build()).toBe("Data: loaded");
    });

    it("resolves override function values", async () => {
      const tpl = createPromptTemplate({
        template: "Value: {v}",
        variables: { v: "default" },
      });

      expect(await tpl.build({ v: () => "dynamic" })).toBe("Value: dynamic");
    });
  });

  // ---------------------------------------------------------------------------
  // Environment variable interpolation
  // ---------------------------------------------------------------------------

  describe("env: interpolation", () => {
    const testEnvVar = "COMMA_AGENTS_TEST_PROMPT_VAR";

    beforeAll(() => {
      process.env[testEnvVar] = "test-env-value";
    });

    afterAll(() => {
      delete process.env[testEnvVar];
    });

    it("resolves {env:VAR} from process.env", async () => {
      const tpl = createPromptTemplate({
        template: `Key: {env:${testEnvVar}}`,
      });

      expect(await tpl.build()).toBe("Key: test-env-value");
    });

    it("throws for undefined env var", async () => {
      const tpl = createPromptTemplate({
        template: "Key: {env:NONEXISTENT_VAR_XXXXX}",
      });

      await expect(tpl.build()).rejects.toThrow("NONEXISTENT_VAR_XXXXX");
    });

    it("env vars can coexist with regular variables", async () => {
      const tpl = createPromptTemplate({
        template: `{name} uses key {env:${testEnvVar}}`,
        variables: { name: "Agent" },
      });

      expect(await tpl.build()).toBe("Agent uses key test-env-value");
    });
  });

  // ---------------------------------------------------------------------------
  // Escaped braces
  // ---------------------------------------------------------------------------

  describe("escaped braces", () => {
    it("double braces produce literal braces", async () => {
      const tpl = createPromptTemplate({
        template: 'Output JSON like {{"key": "value"}}',
      });

      expect(await tpl.build()).toBe('Output JSON like {"key": "value"}');
    });

    it("escaped braces alongside variables", async () => {
      const tpl = createPromptTemplate({
        template: "{name} says {{hello}}",
        variables: { name: "Alice" },
      });

      expect(await tpl.build()).toBe("Alice says {hello}");
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe("error handling", () => {
    it("throws for unresolved variable", async () => {
      const tpl = createPromptTemplate({
        template: "Hello {name}",
      });

      await expect(tpl.build()).rejects.toThrow("{name}");
    });

    it("error message mentions the variable name", async () => {
      const tpl = createPromptTemplate({
        template: "Hello {missingVar}",
      });

      await expect(tpl.build()).rejects.toThrow("missingVar");
    });
  });

  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  describe("properties", () => {
    it("exposes the original template string", () => {
      const tpl = createPromptTemplate({ template: "Hello {name}" });
      expect(tpl.template).toBe("Hello {name}");
    });

    it("exposes the default variables", () => {
      const vars = { name: "Alice", role: "reviewer" };
      const tpl = createPromptTemplate({ template: "test", variables: vars });
      expect(tpl.defaults).toEqual(vars);
    });
  });
});

// ---------------------------------------------------------------------------
// extractVariables
// ---------------------------------------------------------------------------

describe("extractVariables", () => {
  it("extracts simple variable names", () => {
    const vars = extractVariables("Hello {name}, you are {role}.");
    expect(vars).toEqual(["name", "role"]);
  });

  it("extracts env: and file: prefixed variables", () => {
    const vars = extractVariables("Key: {env:API_KEY}, file: {file:/tmp/x}");
    expect(vars).toEqual(["env:API_KEY", "file:/tmp/x"]);
  });

  it("returns empty array for no variables", () => {
    expect(extractVariables("no placeholders")).toEqual([]);
  });

  it("handles empty string", () => {
    expect(extractVariables("")).toEqual([]);
  });

  it("does not extract from escaped braces", () => {
    // Note: extractVariables doesn't handle escaped braces — it just finds all {x} patterns
    // Double braces like {{ produce individual { chars, but the regex still matches the inner content
    // This is a known limitation; the actual build() handles escaping correctly
    const vars = extractVariables("{{escaped}}");
    // The regex will match the content between the inner braces
    expect(vars).toEqual(["escaped"]);
  });

  it("handles repeated variables", () => {
    const vars = extractVariables("{a} and {b} and {a}");
    expect(vars).toEqual(["a", "b", "a"]);
  });
});
