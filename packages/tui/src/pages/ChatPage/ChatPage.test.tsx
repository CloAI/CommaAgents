import { describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";

import { ChatPageRender } from "./ChatPage";
import type { ChatPageTheme } from "./ChatPage.theme";

const STRATEGIES = [
  {
    name: "build",
    version: "1.0",
    path: "/build.json",
    origin: "cwd" as const,
    label: "Build",
  },
  {
    name: "plan",
    version: "1.0",
    path: "/plan.json",
    manifestPath: "/project/comma-project.json",
    origin: "cwd-project" as const,
    label: "Plan",
  },
];

const TEST_THEME: ChatPageTheme = {
  root: {
    flexDirection: "column",
    height: "100%",
  },
  header: {
    paddingX: 0,
    marginBottom: 0,
    title: {
      bold: true,
      color: "blue",
    },
  },
  messageArea: {
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  footer: {
    paddingX: 0,
    text: {
      dimColor: true,
    },
  },
};

function renderChatPage(
  status: React.ComponentProps<typeof ChatPageRender>["chatStatus"] = "running",
  canContinue = status === "completed",
) {
  const onAbort = mock();
  const onContinueSubmit = mock();
  const result = render(
    <ChatPageRender
      theme={TEST_THEME}
      messages={[]}
      chatStatus={status}
      error={null}
      pendingInputAgent={null}
      pendingPermissionRequest={null}
      pendingQuestionRequest={null}
      activeStrategyPath="/build.json"
      canContinue={canContinue}
      onReplySubmit={mock()}
      onSteerSubmit={mock()}
      onContinueSubmit={onContinueSubmit}
      onPermissionDecide={mock()}
      onQuestionSubmit={mock()}
      onAbort={onAbort}
      strategies={STRATEGIES}
      emptyStrategyLabel="No strategies found"
      emptyStrategyPlaceholder="Install a strategy package first..."
    />,
  );

  return { ...result, onAbort, onContinueSubmit };
}

async function pressEscape(stdin: { write: (data: string) => void }) {
  stdin.write("\u001B");
  await new Promise((resolve) => setTimeout(resolve, 20));
}

async function settleInput() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition was not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("ChatPageRender abort shortcut", () => {
  it("aborts an active chat after Escape is pressed twice", async () => {
    const { stdin, onAbort, cleanup } = renderChatPage();
    await settleInput();

    await pressEscape(stdin);
    expect(onAbort).not.toHaveBeenCalled();

    await pressEscape(stdin);
    expect(onAbort).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("does not abort a finished chat", async () => {
    const { stdin, onAbort, lastFrame, cleanup } = renderChatPage("completed");
    await settleInput();

    await pressEscape(stdin);
    await pressEscape(stdin);
    expect(onAbort).not.toHaveBeenCalled();
    expect(lastFrame()).not.toContain("Steer the agents...");
    expect(lastFrame()).toContain("Continue the conversation...");

    cleanup();
  });
});

describe("ChatPageRender continuation composer", () => {
  it("shows a strategy-selectable composer only for continuable completed runs", () => {
    const completed = renderChatPage("completed");
    expect(completed.lastFrame()).toContain("Continue the conversation...");
    expect(completed.lastFrame()).toContain("Build");
    expect(completed.lastFrame()).toContain("Tab to change strategy");
    completed.cleanup();

    for (const status of ["error", "cancelled"] as const) {
      const terminal = renderChatPage(status, true);
      expect(terminal.lastFrame()).not.toContain(
        "Continue the conversation...",
      );
      expect(terminal.lastFrame()).not.toContain("Tab to change strategy");
      terminal.cleanup();
    }

    const missingRunId = renderChatPage("completed", false);
    expect(missingRunId.lastFrame()).not.toContain(
      "Continue the conversation...",
    );
    missingRunId.cleanup();
  });

  it("submits continuation input with a pivoted strategy", async () => {
    const { stdin, onContinueSubmit, lastFrame, cleanup } =
      renderChatPage("completed");
    await settleInput();

    stdin.write("\t");
    await waitFor(() => lastFrame()?.includes("Plan") ?? false);
    stdin.write("refine this");
    await waitFor(() => lastFrame()?.includes("refine this") ?? false);
    stdin.write("\r");
    await waitFor(() => onContinueSubmit.mock.calls.length === 1);

    expect(onContinueSubmit).toHaveBeenCalledWith(STRATEGIES[1], "refine this");
    cleanup();
  });
});
