import type { Meta, StoryObj } from "@storybook/react-vite";
import type React from "react";

import { OutputModalRender } from "./OutputModal";
import { useOutputModalTheme } from "./OutputModal.theme";
import { compileQuery, filterAndHighlight } from "./OutputModal.utils";

/**
 * `OutputModalRender` is the pure render half of the OutputModal — it
 * receives a fully-prepared line list and a compiled query, so stories
 * can exercise its visuals without going through `useModal` / mouse
 * subscriptions.
 *
 * The container `OutputModal` (singleton, mounted in `App.tsx`) is opened
 * by clicking a tool-call or thinking row in `AgentMessage`; those flows
 * are best demoed through the `AgentMessage` stories with mouse input.
 */
const SAMPLE_TOOL_OUTPUT = [
  "[2025-05-10T11:42:01Z] starting build",
  "[2025-05-10T11:42:02Z] resolving graph",
  "[2025-05-10T11:42:03Z] error: missing module 'foo'",
  "[2025-05-10T11:42:04Z] retrying",
  "[2025-05-10T11:42:05Z] error: still missing 'foo'",
  "[2025-05-10T11:42:06Z] giving up",
  "[2025-05-10T11:42:07Z] build failed",
].join("\n");

const SAMPLE_THINKING = [
  "The user wants to refactor the renderer.",
  "Step 1: read the existing component.",
  "Step 2: identify the segment kinds.",
  "Step 3: split container vs render.",
  "Step 4: add tests for each branch.",
].join("\n");

interface DemoProps {
  readonly body: string;
  readonly query: string;
}

function Demo({ body, query: queryRaw }: DemoProps): React.ReactElement {
  const theme = useOutputModalTheme();
  const query = compileQuery(queryRaw);
  const lines = filterAndHighlight(body, query.regex);
  return (
    <OutputModalRender
      theme={theme}
      query={query}
      lines={lines}
      onQueryChange={() => {}}
    />
  );
}

const meta: Meta<typeof Demo> = {
  title: "Components/MessageList/OutputModal",
  component: Demo,
  args: {
    body: SAMPLE_TOOL_OUTPUT,
    query: "",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

/** No active filter — every line shown verbatim. */
export const ToolOutput_NoFilter: Story = {};

/** Active grep — only matching lines retained, hits inverse-highlighted. */
export const ToolOutput_FilteredOnError: Story = {
  args: {
    body: SAMPLE_TOOL_OUTPUT,
    query: "error",
  },
};

/** Empty result set — empty-state row visible. */
export const ToolOutput_NoMatches: Story = {
  args: {
    body: SAMPLE_TOOL_OUTPUT,
    query: "ZZZ",
  },
};

/** Invalid pattern — status shows "invalid regex", no filter applied. */
export const ToolOutput_InvalidRegex: Story = {
  args: {
    body: SAMPLE_TOOL_OUTPUT,
    query: "[oops",
  },
};

/** Thinking body with a multi-step deliberation. */
export const Thinking_NoFilter: Story = {
  args: {
    body: SAMPLE_THINKING,
    query: "",
  },
};

/** Thinking body filtered to "Step" — illustrates the highlight slicing. */
export const Thinking_FilteredOnStep: Story = {
  args: {
    body: SAMPLE_THINKING,
    query: "Step \\d",
  },
};
