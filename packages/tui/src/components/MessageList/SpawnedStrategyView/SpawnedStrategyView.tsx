import { Box, Text } from "ink";
import type React from "react";

import {
  TOOL_SPINNER_FRAMES,
  useToolSpinner,
} from "../../../hooks/useToolSpinner";
import { BorderedPanel } from "../../BorderedPanel";
import type { ToolCallViewStatus } from "../ToolCallView";
import type { SpawnedStrategyViewTheme } from "./SpawnedStrategyView.theme";
import { useSpawnedStrategyViewTheme } from "./SpawnedStrategyView.theme";

const STATUS_GLYPHS: Record<Exclude<ToolCallViewStatus, "running">, string> = {
  completed: "✓",
  error: "✗",
};

const INPUT_PREVIEW_LIMIT = 160;

export interface SpawnedStrategyViewProps {
  /** Raw JSON-encoded arguments from the `launch_strategy` tool call. */
  readonly args: string;
  /** Current execution status of the spawned strategy. */
  readonly status: ToolCallViewStatus;
  /** Error message when the spawned strategy failed. */
  readonly error?: string;
  /** Nested messages emitted while the spawned strategy was running. */
  readonly children: React.ReactNode;
}

export function SpawnedStrategyView({
  args,
  status,
  error,
  children,
}: SpawnedStrategyViewProps): React.ReactElement {
  const theme = useSpawnedStrategyViewTheme();
  const spinnerFrame = useToolSpinner(status === "running");
  const leadingGlyph =
    status === "running"
      ? (spinnerFrame ?? TOOL_SPINNER_FRAMES[0])
      : STATUS_GLYPHS[status];
  const parsedArguments = parseLaunchStrategyArguments(args);

  return (
    <SpawnedStrategyViewRender
      theme={theme}
      leadingGlyph={leadingGlyph}
      strategyName={parsedArguments.strategyName}
      inputPreview={parsedArguments.inputPreview}
      status={status}
      error={error}
    >
      {children}
    </SpawnedStrategyViewRender>
  );
}

export interface SpawnedStrategyViewRenderProps {
  /** Resolved theme styles. */
  readonly theme: SpawnedStrategyViewTheme;
  /** Status glyph shown before the label. */
  readonly leadingGlyph: string;
  /** Strategy name parsed from the tool-call arguments. */
  readonly strategyName: string;
  /** Initial input preview parsed from the tool-call arguments. */
  readonly inputPreview: string;
  /** Current execution status of the spawned strategy. */
  readonly status: ToolCallViewStatus;
  /** Error message when the spawned strategy failed. */
  readonly error?: string;
  /** Nested message rows emitted by the spawned strategy. */
  readonly children: React.ReactNode;
}

export function SpawnedStrategyViewRender({
  theme,
  leadingGlyph,
  strategyName,
  inputPreview,
  status,
  error,
  children,
}: SpawnedStrategyViewRenderProps): React.ReactElement {
  const glyphStyle =
    status === "running"
      ? theme.runningGlyph
      : status === "completed"
        ? theme.completedGlyph
        : theme.errorGlyph;
  const header = `spawned ${strategyName}`;

  return (
    <Box {...theme.container}>
      <BorderedPanel
        header={header}
        borderColor={theme.borderColor[status]}
        headerColor={theme.borderColor[status]}
      >
        <Box {...theme.body}>
          <Box {...theme.metaRow}>
            <Text>
              <Text {...glyphStyle}>{leadingGlyph}</Text>
              <Text> </Text>
              <Text {...theme.title}>launch_strategy</Text>
              {inputPreview.length > 0 ? (
                <>
                  <Text> </Text>
                  <Text {...theme.muted}>{inputPreview}</Text>
                </>
              ) : null}
              {error ? (
                <>
                  <Text> </Text>
                  <Text {...theme.error}>{error}</Text>
                </>
              ) : null}
            </Text>
          </Box>
          <Box {...theme.nestedMessages}>{children}</Box>
        </Box>
      </BorderedPanel>
    </Box>
  );
}

interface ParsedLaunchStrategyArguments {
  readonly strategyName: string;
  readonly inputPreview: string;
}

function parseLaunchStrategyArguments(
  args: string,
): ParsedLaunchStrategyArguments {
  try {
    const parsedArguments = JSON.parse(args) as unknown;
    if (typeof parsedArguments !== "object" || parsedArguments === null) {
      return { strategyName: "strategy", inputPreview: "" };
    }
    const candidate = parsedArguments as Record<string, unknown>;
    const strategyName =
      typeof candidate.name === "string" && candidate.name.length > 0
        ? candidate.name
        : "strategy";
    const inputPreview =
      typeof candidate.input === "string" && candidate.input.length > 0
        ? formatInputPreview(candidate.input)
        : "";
    return { strategyName, inputPreview };
  } catch {
    return { strategyName: "strategy", inputPreview: "" };
  }
}

function formatInputPreview(input: string): string {
  const flattened = input.replace(/\s+/gu, " ").trim();
  if (flattened.length <= INPUT_PREVIEW_LIMIT) return flattened;
  return `${flattened.slice(0, INPUT_PREVIEW_LIMIT)}…`;
}
