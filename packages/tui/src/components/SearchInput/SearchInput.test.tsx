import React from "react";
import { render } from "ink-testing-library";
import { describe, expect, it } from "bun:test";

import { SearchInputRender } from "./SearchInput";
import type { SearchInputTheme } from "./SearchInput.theme";
import {
  filterByQuery,
  matchesQuery,
  tokenizeQuery,
} from "./SearchInput.utils";

const TEST_THEME: SearchInputTheme = {
  inputBorder: {
    borderStyle: "round",
    borderColor: "cyan",
    paddingX: 1,
    width: "100%",
  },
  prompt: { color: "cyan", bold: true },
  query: { color: "cyan" },
  placeholder: { color: "gray", dimColor: true },
};

describe("SearchInputRender", () => {
  it("should show the placeholder when value is empty", () => {
    const result = render(
      <SearchInputRender
        theme={TEST_THEME}
        value=""
        placeholder="Type to filter..."
        prompt="> "
      />,
    );
    expect(result.lastFrame()).toContain("Type to filter...");
    expect(result.lastFrame()).toContain(">");
    result.cleanup();
  });

  it("should show the value when it is non-empty", () => {
    const result = render(
      <SearchInputRender
        theme={TEST_THEME}
        value="openai"
        placeholder="Type to filter..."
        prompt="> "
      />,
    );
    const frame = result.lastFrame() ?? "";
    expect(frame).toContain("openai");
    expect(frame.includes("Type to filter...")).toBe(false);
    result.cleanup();
  });
});

describe("tokenizeQuery", () => {
  it("should return an empty list for empty or whitespace-only input", () => {
    expect(tokenizeQuery("")).toEqual([]);
    expect(tokenizeQuery("   ")).toEqual([]);
  });

  it("should split on whitespace and lowercase each token", () => {
    expect(tokenizeQuery("  Foo  BAR  baz")).toEqual(["foo", "bar", "baz"]);
  });
});

describe("matchesQuery", () => {
  it("should return true for empty queries (match everything)", () => {
    expect(matchesQuery("anything", "")).toBe(true);
    expect(matchesQuery("anything", "   ")).toBe(true);
  });

  it("should require every token to be present", () => {
    expect(matchesQuery("OpenAI GPT-4", "open gpt")).toBe(true);
    expect(matchesQuery("OpenAI GPT-4", "open claude")).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(matchesQuery("Anthropic Claude", "CLAUDE")).toBe(true);
  });
});

describe("filterByQuery", () => {
  interface Item {
    readonly id: string;
    readonly name: string;
  }
  const items: readonly Item[] = [
    { id: "openai", name: "OpenAI" },
    { id: "anthropic", name: "Anthropic" },
    { id: "ollama", name: "Ollama" },
  ];

  it("should return the full list for an empty query", () => {
    expect(filterByQuery(items, "", (item) => item.name)).toEqual(items);
  });

  it("should filter by the projected haystack and preserve order", () => {
    const filtered = filterByQuery(items, "o", (item) => item.name);
    expect(filtered.map((item) => item.id)).toEqual(["openai", "anthropic", "ollama"]);

    const narrower = filterByQuery(items, "ol", (item) => item.name);
    expect(narrower.map((item) => item.id)).toEqual(["ollama"]);
  });
});
