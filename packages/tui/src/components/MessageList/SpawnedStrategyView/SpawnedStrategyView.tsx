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
const RESULT_PREVIEW_LIMIT = 240;

export interface SpawnedStrategyViewProps {
  /** Raw JSON-encoded arguments from the `launch_strategy` tool call. */
  readonly args: string;
  /** Current execution status of the spawned strategy. */
  readonly status: ToolCallViewStatus;
  /** Raw JSON-encoded result from the completed `launch_strategy` tool call. */
  readonly output?: string;
  /** Error message when the spawned strategy failed. */
  readonly error?: string;
  /** Nested messages emitted while the spawned strategy was running. */
  readonly children: React.ReactNode;
}

export function SpawnedStrategyView({
  args,
  status,
  output,
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
      modelOverride={parsedArguments.modelOverride}
      resultDetails={parseLaunchStrategyResult(output)}
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
  /** Optional provider/model override parsed from the tool-call arguments. */
  readonly modelOverride: string;
  /** Details parsed from the completed tool result. */
  readonly resultDetails: ParsedLaunchStrategyResult;
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
  modelOverride,
  resultDetails,
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
              {error ? (
                <>
                  <Text> </Text>
                  <Text {...theme.error}>{error}</Text>
                </>
              ) : null}
            </Text>
          </Box>
          {inputPreview.length > 0 ? (
            <DetailRow theme={theme} label="input" value={inputPreview} />
          ) : null}
          {modelOverride.length > 0 ? (
            <DetailRow theme={theme} label="model" value={modelOverride} />
          ) : null}
          {resultDetails.path.length > 0 ? (
            <DetailRow theme={theme} label="path" value={resultDetails.path} />
          ) : null}
          {resultDetails.finishReason.length > 0 ? (
            <DetailRow
              theme={theme}
              label="finish"
              value={resultDetails.finishReason}
            />
          ) : null}
          {resultDetails.resultPreview.length > 0 ? (
            <DetailRow
              theme={theme}
              label="result"
              value={resultDetails.resultPreview}
            />
          ) : null}
          <Box {...theme.nestedMessages}>{children}</Box>
        </Box>
      </BorderedPanel>
    </Box>
  );
}

interface ParsedLaunchStrategyArguments {
  readonly strategyName: string;
  readonly inputPreview: string;
  readonly modelOverride: string;
}

interface ParsedLaunchStrategyResult {
  readonly path: string;
  readonly finishReason: string;
  readonly resultPreview: string;
}

function parseLaunchStrategyArguments(
  args: string,
): ParsedLaunchStrategyArguments {
  try {
    const parsedArguments = JSON.parse(args) as unknown;
    if (typeof parsedArguments !== "object" || parsedArguments === null) {
      return { strategyName: "strategy", inputPreview: "", modelOverride: "" };
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
    const modelOverride =
      typeof candidate.modelOverride === "string"
        ? candidate.modelOverride
        : "";
    return { strategyName, inputPreview, modelOverride };
  } catch {
    return { strategyName: "strategy", inputPreview: "", modelOverride: "" };
  }
}

function formatInputPreview(input: string): string {
  return formatPreview(input, INPUT_PREVIEW_LIMIT);
}

function parseLaunchStrategyResult(
  output: string | undefined,
): ParsedLaunchStrategyResult {
  if (!output) return { path: "", finishReason: "", resultPreview: "" };

  try {
    const parsedOutput = JSON.parse(output) as unknown;
    if (typeof parsedOutput !== "object" || parsedOutput === null) {
      return {
        path: "",
        finishReason: "",
        resultPreview: formatPreview(output, RESULT_PREVIEW_LIMIT),
      };
    }
    const result = parsedOutput as Record<string, unknown>;
    const data =
      typeof result.data === "object" && result.data !== null
        ? (result.data as Record<string, unknown>)
        : result;
    return {
      path: typeof data.path === "string" ? data.path : "",
      finishReason:
        typeof data.finishReason === "string" ? data.finishReason : "",
      resultPreview:
        typeof data.result === "string"
          ? formatPreview(data.result, RESULT_PREVIEW_LIMIT)
          : "",
    };
  } catch {
    return {
      path: "",
      finishReason: "",
      resultPreview: formatPreview(output, RESULT_PREVIEW_LIMIT),
    };
  }
}

function formatPreview(value: string, limit: number): string {
  const flattened = value.replace(/\s+/gu, " ").trim();
  if (flattened.length <= limit) return flattened;
  return `${flattened.slice(0, limit)}…`;
}

function DetailRow({
  theme,
  label,
  value,
}: {
  readonly theme: SpawnedStrategyViewTheme;
  readonly label: string;
  readonly value: string;
}): React.ReactElement {
  return (
    <Box {...theme.detailRow}>
      <Text {...theme.detailLabel}>{label}: </Text>
      <Text {...theme.muted}>{value}</Text>
    </Box>
  );
}
