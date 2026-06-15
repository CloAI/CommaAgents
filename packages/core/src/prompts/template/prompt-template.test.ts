// Tests for PromptTemplate — LiquidJS-backed template engine
//
// Covers: basic interpolation, overrides, dynamic values, env/file/exec
// filters, conditionals, loops, and error handling.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPromptTemplate } from "./prompt-template";

// Basic variable interpolation

describe("createPromptTemplate", () => {
  describe("basic interpolation", () => {
    it("replaces a single variable", async () => {
      const tpl = createPromptTemplate({
        template: "Hello, {{ name }}!",
        variables: { name: "Alice" },
      });

      const result = await tpl.render();
      expect(result).toBe("Hello, Alice!");
    });

    it("replaces multiple variables", async () => {
      const tpl = createPromptTemplate({
        template: "You are {{ role }}, an expert in {{ language }}.",
        variables: { role: "a reviewer", language: "TypeScript" },
      });

      const result = await tpl.render();
      expect(result).toBe("You are a reviewer, an expert in TypeScript.");
    });

    it("returns the template as-is if no placeholders", async () => {
      const tpl = createPromptTemplate({
        template: "No placeholders here.",
      });

      const result = await tpl.render();
      expect(result).toBe("No placeholders here.");
    });

    it("handles empty string template", async () => {
      const tpl = createPromptTemplate({ template: "" });
      expect(await tpl.render()).toBe("");
    });

    it("renders numeric and boolean values", async () => {
      const tpl = createPromptTemplate({
        template: "Count: {{ count }}, Active: {{ active }}",
        variables: { count: 42, active: true },
      });
      expect(await tpl.render()).toBe("Count: 42, Active: true");
    });
  });

  // ---------------------------------------------------------------------------
  // Overrides
  // ---------------------------------------------------------------------------

  describe("overrides", () => {
    it("overrides take precedence over defaults", async () => {
      const tpl = createPromptTemplate({
        template: "Language: {{ lang }}",
        variables: { lang: "TypeScript" },
      });

      const result = await tpl.render({ lang: "Rust" });
      expect(result).toBe("Language: Rust");
    });

    it("defaults are used when override is not provided", async () => {
      const tpl = createPromptTemplate({
        template: "{{ greeting }}, {{ name }}!",
        variables: { greeting: "Hello", name: "World" },
      });

      const result = await tpl.render({ name: "Alice" });
      expect(result).toBe("Hello, Alice!");
    });
  });

  // ---------------------------------------------------------------------------
  // Dynamic (function) values
  // ---------------------------------------------------------------------------

  describe("dynamic values", () => {
    it("resolves synchronous function values", async () => {
      const tpl = createPromptTemplate({
        template: "Count: {{ count }}",
        variables: { count: () => "42" },
      });

      expect(await tpl.render()).toBe("Count: 42");
    });

    it("resolves async function values", async () => {
      const tpl = createPromptTemplate({
        template: "Data: {{ data }}",
        variables: {
          data: async () => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return "loaded";
          },
        },
      });

      expect(await tpl.render()).toBe("Data: loaded");
    });

    it("resolves override function values", async () => {
      const tpl = createPromptTemplate({
        template: "Value: {{ v }}",
        variables: { v: "default" },
      });

      expect(await tpl.render({ v: () => "dynamic" })).toBe("Value: dynamic");
    });
  });

  // ---------------------------------------------------------------------------
  // Environment variable filter
  // ---------------------------------------------------------------------------

  describe("env filter", () => {
    const testEnvVar = "COMMA_AGENTS_TEST_PROMPT_VAR";

    beforeAll(() => {
      process.env[testEnvVar] = "test-env-value";
    });

    afterAll(() => {
      delete process.env[testEnvVar];
    });

    it('resolves {{ "VAR" | env }} from process.env', async () => {
      const tpl = createPromptTemplate({
        template: `Key: {{ "${testEnvVar}" | env }}`,
      });

      expect(await tpl.render()).toBe("Key: test-env-value");
    });

    it("throws for undefined env var", async () => {
      const tpl = createPromptTemplate({
        template: '{{ "NONEXISTENT_VAR_XXXXX" | env }}',
      });

      await expect(tpl.render()).rejects.toThrow("NONEXISTENT_VAR_XXXXX");
    });

    it("env filter can coexist with regular variables", async () => {
      const tpl = createPromptTemplate({
        template: `{{ name }} uses key {{ "${testEnvVar}" | env }}`,
        variables: { name: "Agent" },
      });

      expect(await tpl.render()).toBe("Agent uses key test-env-value");
    });

    it("throws when no env variable name is provided", async () => {
      const tpl = createPromptTemplate({ template: '{{ "" | env }}' });

      await expect(tpl.render()).rejects.toThrow("requires a variable name");
    });
  });

  describe("file filter", () => {
    it("reads and trims the first line of a file", async () => {
      const dir = await mkdtemp(join(tmpdir(), "prompt-template-"));
      const path = join(dir, "value.txt");
      await writeFile(path, "  first line  \nsecond line");

      try {
        const tpl = createPromptTemplate({
          template: `{{ "${path}" | file }}`,
        });
        expect(await tpl.render()).toBe("first line");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it("reports missing and empty file paths", async () => {
      await expect(
        createPromptTemplate({ template: '{{ "" | file }}' }).render(),
      ).rejects.toThrow("requires a file path");
      await expect(
        createPromptTemplate({
          template: '{{ "/definitely/missing/prompt-template-file" | file }}',
        }).render(),
      ).rejects.toThrow("could not read");
    });
  });

  // ---------------------------------------------------------------------------
  // Exec filter
  // ---------------------------------------------------------------------------

  describe("exec filter", () => {
    it("executes a shell command and returns stdout", async () => {
      const tpl = createPromptTemplate({
        template: '{{ "echo hello" | exec }}',
      });

      expect(await tpl.render()).toBe("hello");
    });

    it("trims output whitespace", async () => {
      const tpl = createPromptTemplate({
        template: '{{ "echo   spaces  " | exec }}',
      });

      expect(await tpl.render()).toBe("spaces");
    });

    it("works with variable-based commands", async () => {
      const tpl = createPromptTemplate({
        template: "Today: {{ cmd | exec }}",
        variables: { cmd: "echo 2025-01-01" },
      });

      expect(await tpl.render()).toBe("Today: 2025-01-01");
    });

    it("reports empty commands and failed command output", async () => {
      await expect(
        createPromptTemplate({ template: '{{ "" | exec }}' }).render(),
      ).rejects.toThrow("requires a command");
      await expect(
        createPromptTemplate({ template: '{{ "true" | exec }}' }).render(),
      ).rejects.toThrow("empty output");
    });
  });

  // ---------------------------------------------------------------------------
  // Conditionals (Liquid {% if %})
  // ---------------------------------------------------------------------------

  describe("conditionals", () => {
    it("renders if block when condition is truthy", async () => {
      const tpl = createPromptTemplate({
        template: "{% if show_tools %}Tools available{% endif %}",
        variables: { show_tools: true },
      });

      expect(await tpl.render()).toBe("Tools available");
    });

    it("skips if block when condition is falsy", async () => {
      const tpl = createPromptTemplate({
        template: "Base.{% if show_tools %} Tools available.{% endif %}",
        variables: { show_tools: false },
      });

      expect(await tpl.render()).toBe("Base.");
    });

    it("handles if/else", async () => {
      const tpl = createPromptTemplate({
        template:
          "{% if verbose %}Detailed mode{% else %}Brief mode{% endif %}",
      });

      expect(await tpl.render({ verbose: true })).toBe("Detailed mode");
      expect(await tpl.render({ verbose: false })).toBe("Brief mode");
    });
  });

  // ---------------------------------------------------------------------------
  // Loops (Liquid {% for %})
  // ---------------------------------------------------------------------------

  describe("loops", () => {
    it("iterates over an array", async () => {
      const tpl = createPromptTemplate({
        template: "{% for tool in tools %}{{ tool }} {% endfor %}",
        variables: { tools: ["bash", "read", "write"] },
      });

      expect(await tpl.render()).toBe("bash read write ");
    });

    it("handles empty arrays", async () => {
      const tpl = createPromptTemplate({
        template: "Tools:{% for tool in tools %} {{ tool }}{% endfor %}",
        variables: { tools: [] },
      });

      expect(await tpl.render()).toBe("Tools:");
    });

    it("accesses object properties in loops", async () => {
      const tpl = createPromptTemplate({
        template:
          "{% for item in items %}{{ item.name }}: {{ item.desc }}; {% endfor %}",
        variables: {
          items: [
            { name: "bash", desc: "shell" },
            { name: "read", desc: "files" },
          ],
        },
      });

      expect(await tpl.render()).toBe("bash: shell; read: files; ");
    });
  });

  // ---------------------------------------------------------------------------
  // Built-in Liquid filters
  // ---------------------------------------------------------------------------

  describe("built-in filters", () => {
    it("upcase filter", async () => {
      const tpl = createPromptTemplate({
        template: "{{ name | upcase }}",
        variables: { name: "alice" },
      });

      expect(await tpl.render()).toBe("ALICE");
    });

    it("downcase filter", async () => {
      const tpl = createPromptTemplate({
        template: "{{ name | downcase }}",
        variables: { name: "ALICE" },
      });

      expect(await tpl.render()).toBe("alice");
    });

    it("size filter", async () => {
      const tpl = createPromptTemplate({
        template: "{{ items | size }} items",
        variables: { items: ["a", "b", "c"] },
      });

      expect(await tpl.render()).toBe("3 items");
    });

    it("truncate filter", async () => {
      const tpl = createPromptTemplate({
        template: "{{ text | truncate: 10 }}",
        variables: { text: "This is a long string that should be truncated" },
      });

      const result = await tpl.render();
      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe("error handling", () => {
    it("renders empty string for undefined variable (non-strict)", async () => {
      // LiquidJS with strictVariables: false renders undefined vars as empty string
      const tpl = createPromptTemplate({
        template: "Hello {{ name }}",
      });

      const result = await tpl.render();
      expect(result).toBe("Hello ");
    });
  });

  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  describe("properties", () => {
    it("exposes the original template string", () => {
      const tpl = createPromptTemplate({ template: "Hello {{ name }}" });
      expect(tpl.template).toBe("Hello {{ name }}");
    });

    it("exposes the default variables", () => {
      const vars = { name: "Alice", role: "reviewer" };
      const tpl = createPromptTemplate({ template: "test", variables: vars });
      expect(tpl.defaults).toEqual(vars);
    });
  });

  // ---------------------------------------------------------------------------
  // updateVariables
  // ---------------------------------------------------------------------------

  describe("updatePromptVariables", () => {
    it("merges new variables into defaults for subsequent renders", async () => {
      const tpl = createPromptTemplate({
        template: "You are {{ role }}, reviewing {{ language }} code.",
        variables: { role: "a reviewer" },
      });

      tpl.updatePromptVariables({ language: "TypeScript" });

      const result = await tpl.render();
      expect(result).toBe("You are a reviewer, reviewing TypeScript code.");
    });

    it("overwrites existing default values", async () => {
      const tpl = createPromptTemplate({
        template: "Role: {{ role }}",
        variables: { role: "initial" },
      });

      tpl.updatePromptVariables({ role: "updated" });

      expect(await tpl.render()).toBe("Role: updated");
    });

    it("reflects updated variables in the defaults property", () => {
      const tpl = createPromptTemplate({
        template: "{{ greeting }}",
        variables: { greeting: "Hello" },
      });

      tpl.updatePromptVariables({ name: "World" });

      expect(tpl.defaults).toEqual({ greeting: "Hello", name: "World" });
    });

    it("works with function values", async () => {
      const tpl = createPromptTemplate({
        template: "Count: {{ count }}",
      });

      tpl.updatePromptVariables({ count: () => "42" });

      expect(await tpl.render()).toBe("Count: 42");
    });

    it("render overrides still take precedence over updated defaults", async () => {
      const tpl = createPromptTemplate({
        template: "Role: {{ role }}",
        variables: { role: "default" },
      });

      tpl.updatePromptVariables({ role: "updated" });

      expect(await tpl.render({ role: "override" })).toBe("Role: override");
    });

    it("accumulates multiple update calls", async () => {
      const tpl = createPromptTemplate({
        template: "{{ a }} {{ b }} {{ c }}",
        variables: { a: "one" },
      });

      tpl.updatePromptVariables({ b: "two" });
      tpl.updatePromptVariables({ c: "three" });

      expect(await tpl.render()).toBe("one two three");
    });

    it("is a no-op when called with an empty object", async () => {
      const tpl = createPromptTemplate({
        template: "Name: {{ name }}",
        variables: { name: "Alice" },
      });

      tpl.updatePromptVariables({});

      expect(await tpl.render()).toBe("Name: Alice");
    });
  });
});
