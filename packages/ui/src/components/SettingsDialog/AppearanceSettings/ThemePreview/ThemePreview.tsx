import type { RunErrorCode, RunToolStatus } from "@comma-agents/daemon";
import { ChatInput } from "../../../ChatInput";
import { RunSection } from "../../../RunSection";
import { themeCssVariables } from "../../../../theme";
import type { ThemePalette } from "../../../../theme";
import type { RunMessage } from "../../../../hooks/runs";
import styles from "./ThemePreview.module.scss";

const SAMPLE_TIME = "2026-01-01T12:00:00Z";
const SAMPLE_END = "2026-01-01T12:00:02Z";

const SAMPLE_REPLY = `Added \`greet\` to the utilities. It returns a friendly message:

\`\`\`ts
// Greets a user
export function greet(name: string): string {
  return "Hello, " + name + "!" + 42;
}
\`\`\`

- **Success** and *failure* states are both shown below.
- See [the docs](https://example.com) for more.`;

/** Fixed sample conversation rendered by the real chat sections. */
const SAMPLE_MESSAGES: readonly RunMessage[] = [
  {
    role: "user",
    id: "preview-user",
    createdAt: SAMPLE_TIME,
    streaming: false,
    content: [
      { type: "text", text: "Add a greeting helper and run the tests." },
    ],
  },
  {
    role: "agent",
    id: "preview-agent",
    agentName: "assistant",
    model: "provider/model",
    createdAt: SAMPLE_TIME,
    completedAt: SAMPLE_END,
    streaming: false,
    usage: { promptTokens: 300, completionTokens: 112 },
    content: [
      { type: "reasoning", text: "Write the helper, then run the tests." },
      {
        type: "tool",
        toolCallId: "preview-tool-ok",
        toolName: "run_command",
        status: "completed" as RunToolStatus.completed,
        arguments: { command: "bun test" },
        output: { result: "12 passed" },
      },
      {
        type: "tool",
        toolCallId: "preview-tool-failed",
        toolName: "read_file",
        status: "failed" as RunToolStatus.failed,
        arguments: { path: "missing.ts" },
        output: null,
        error: {
          code: "TOOL_EXECUTION_ERROR" as RunErrorCode.TOOL_EXECUTION_ERROR,
        },
      },
      { type: "text", text: SAMPLE_REPLY },
    ],
  },
];

/** Colors to demonstrate. */
export interface ThemePreviewProps {
  /** Palette shown, independent of the active theme. */
  readonly palette: ThemePalette;
}

/**
 * Show a palette on the real chat sections and input, scoped so the rest of the app is unchanged.
 * @param {ThemePreviewProps} props - Palette to preview.
 * @returns {React.ReactElement} The sample conversation.
 */
export function ThemePreview({ palette }: ThemePreviewProps) {
  return (
    <div
      className={styles.preview}
      style={themeCssVariables(palette)}
      role="group"
      aria-label="Theme preview"
    >
      {SAMPLE_MESSAGES.map((message) => (
        <RunSection key={message.id} message={message} />
      ))}
      <ChatInput
        onSubmit={() => undefined}
        placeholder="Message the assistant..."
      />
    </div>
  );
}
