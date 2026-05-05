import { codeToANSI } from "@shikijs/cli";
import { Box, Text } from "ink";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { Highlighter } from "shiki";
import { createHighlighter } from "shiki";
import { useDebugRender } from "../../hooks/useDebugRender";
import {
  DEFAULT_SHIKI_THEME,
  MIN_LINE_NUMBER_WIDTH,
  PRELOADED_LANGUAGES,
} from "./CodeView.constants";
import type { CodeViewTheme } from "./CodeView.theme";
import { useCodeViewTheme } from "./CodeView.theme";
import type { CodeViewProps, CodeViewRenderProps } from "./CodeView.types";

export function CodeView({
  code,
  language,
  showLineNumbers = false,
}: CodeViewProps): React.ReactElement {
  useDebugRender("CodeView", { props: { code, language, showLineNumbers } });
  const theme = useCodeViewTheme();
  const highlighterRef = useRef<Highlighter | null>(null);
  const [highlightedCode, setHighlightedCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function highlight(): Promise<void> {
      if (!highlighterRef.current) {
        highlighterRef.current = await createHighlighter({
          themes: [DEFAULT_SHIKI_THEME],
          langs: [...PRELOADED_LANGUAGES],
        });
      }

      const highlighter = highlighterRef.current;

      /** Load the language on-demand if it wasn't preloaded. */
      const loadedLanguages = highlighter.getLoadedLanguages();
      if (!loadedLanguages.includes(language)) {
        try {
          await highlighter.loadLanguage(
            language as Parameters<typeof highlighter.loadLanguage>[0],
          );
        } catch {
          /** Language not supported — fall back to plain text. */
          if (!cancelled) {
            setHighlightedCode(null);
          }
          return;
        }
      }

      const ansiOutput = await codeToANSI(code, language, DEFAULT_SHIKI_THEME);

      if (!cancelled) {
        setHighlightedCode(ansiOutput);
      }
    }

    highlight();

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <CodeViewRender
      highlightedCode={highlightedCode}
      showLineNumbers={showLineNumbers}
      code={code}
      theme={theme}
    />
  );
}

export function CodeViewRender({
  highlightedCode,
  showLineNumbers,
  code,
  theme,
}: CodeViewRenderProps): React.ReactElement {
  const lines = (highlightedCode ?? code).split("\n");
  const totalLines = lines.length;
  const gutterWidth = Math.max(
    MIN_LINE_NUMBER_WIDTH,
    String(totalLines).length,
  );

  return (
    <Box {...theme.root}>
      {lines.map((line, index) => (
        <Box key={index} {...theme.lineRow}>
          {showLineNumbers ? (
            <>
              <Text {...theme.lineNumber}>
                {String(index + 1).padStart(gutterWidth, " ")}
              </Text>
              <Box width={theme.gutterGap} />
            </>
          ) : null}
          <Text>{line}</Text>
        </Box>
      ))}
    </Box>
  );
}
