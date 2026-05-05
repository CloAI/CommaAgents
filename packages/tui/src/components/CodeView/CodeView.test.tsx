import React from "react";
import { render } from "ink-testing-library";
import { describe, expect, it } from "bun:test";

import { CodeViewRender } from "./CodeView";
import type { CodeViewTheme } from "./CodeView.theme";

const TEST_THEME: CodeViewTheme = {
  root: { flexDirection: "column", paddingX: 0 },
  lineRow: { flexDirection: "row" },
  lineNumber: { dimColor: true, color: "gray" },
  gutterGap: 1,
  fallback: { dimColor: true },
};

describe("CodeViewRender", () => {
  describe("basic rendering", () => {
    it("should render plain code without line numbers", () => {
      const { lastFrame } = render(
        <CodeViewRender
          highlightedCode={null}
          showLineNumbers={false}
          code={"const greeting = 1;\nconst count = 2;"}
          theme={TEST_THEME}
        />,
      );

      expect(lastFrame()).toContain("const greeting = 1;");
      expect(lastFrame()).toContain("const count = 2;");
      expect(lastFrame()).toMatchSnapshot();
    });

    it("should render empty code without error", () => {
      const { lastFrame } = render(
        <CodeViewRender
          highlightedCode={null}
          showLineNumbers={false}
          code={""}
          theme={TEST_THEME}
        />,
      );

      expect(lastFrame()).toBeDefined();
      expect(lastFrame()).toMatchSnapshot();
    });

    it("should render single line code correctly", () => {
      const { lastFrame } = render(
        <CodeViewRender
          highlightedCode={null}
          showLineNumbers={true}
          code={"console.log('hello')"}
          theme={TEST_THEME}
        />,
      );

      expect(lastFrame()).toContain("1");
      expect(lastFrame()).toContain("console.log('hello')");
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe("line numbers", () => {
    it("should display line numbers when showLineNumbers is true", () => {
      const { lastFrame } = render(
        <CodeViewRender
          highlightedCode={null}
          showLineNumbers={true}
          code={"line one\nline two\nline three"}
          theme={TEST_THEME}
        />,
      );

      expect(lastFrame()).toContain("1");
      expect(lastFrame()).toContain("2");
      expect(lastFrame()).toContain("3");
      expect(lastFrame()).toContain("line one");
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe("highlighted code", () => {
    it("should use highlightedCode instead of raw code when provided", () => {
      const { lastFrame } = render(
        <CodeViewRender
          highlightedCode={"HIGHLIGHTED_LINE_1\nHIGHLIGHTED_LINE_2"}
          showLineNumbers={false}
          code={"original\ncode"}
          theme={TEST_THEME}
        />,
      );

      expect(lastFrame()).toContain("HIGHLIGHTED_LINE_1");
      expect(lastFrame()).not.toContain("original");
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
