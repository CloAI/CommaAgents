import type { Meta, StoryObj } from "@storybook/react-vite";
import { act, useState } from "react";
import {
  expect,
  fireEvent,
  fn,
  spyOn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import { Button } from "../../design-system/Button";
import { createLogBucket, formatLogEntries } from "../../hooks/useLogBucket";
import type { LogBucket } from "../../hooks/useLogBucket";
import { LogDialog } from "./LogDialog";

function Launcher() {
  const [open, setOpen] = useState(false);
  const [bucket] = useState(() => {
    const logs = createLogBucket({ name: "example" });
    logs.info("Connected.");
    logs.warn("Connection delayed.", "Retry scheduled.");
    logs.error("Request failed.", "command: runs.get; code: NOT_FOUND");
    return logs;
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open logs</Button>
      {open && (
        <LogDialog
          bucket={bucket}
          title="Daemon logs"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const meta = {
  title: "Components/LogDialog",
  component: LogDialog,
  args: {
    bucket: createLogBucket({ name: "story" }),
    title: "Daemon logs",
    onClose: fn(),
  },
  beforeEach: () => {
    const environment = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previous = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    return () => {
      environment.IS_REACT_ACT_ENVIRONMENT = previous;
    };
  },
  render: () => <Launcher />,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LogDialog>;
// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const SearchAndClear: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Open logs" });
    await userEvent.click(trigger);
    const search = canvas.getByRole("searchbox", { name: "Search logs" });
    const level = canvas.getByRole("combobox", { name: "Log level" });
    await userEvent.type(search, "RUNS.GET");
    await expect(canvas.getByText("1 / 3 entries")).toBeVisible();
    await expect(canvas.getByLabelText("Log entries")).toHaveTextContent(
      "Request failed.",
    );
    await userEvent.selectOptions(level, "warn");
    await expect(canvas.getByText("No matching logs.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Clear" }));
    await expect(canvas.getByText("No logs yet.")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Copy all" }),
    ).toBeDisabled();
    // Escape requests the native dialog cancel event; simulated keydown alone does not.
    fireEvent(
      canvas.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(
      canvas.getByRole("dialog", { name: "Daemon logs" }),
    ).toBeVisible();
    await expect(canvas.getByRole("searchbox")).toHaveValue("");
    await expect(canvas.getByRole("combobox")).toHaveValue("all");
  },
};

export const CopyAll: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const write = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Open logs" }));
      await userEvent.selectOptions(canvas.getByRole("combobox"), "error");
      await userEvent.click(canvas.getByRole("button", { name: "Copy all" }));
      await expect(canvas.getByRole("status")).toHaveTextContent(
        "Copied all logs.",
      );
      const text = write.mock.calls.at(-1)![0];
      await expect(text).toContain("[INFO] Connected.");
      await expect(text).toContain("[WARN] Connection delayed.");
      await expect(text).toContain("[ERROR] Request failed.");
      write.mockRejectedValue(new Error("Clipboard unavailable"));
      await userEvent.click(canvas.getByRole("button", { name: "Copy all" }));
      await expect(canvas.getByRole("status")).toHaveTextContent(
        "Could not copy logs.",
      );
    } finally {
      write.mockRestore();
    }
  },
};

export const RetentionAndCoalescing: Story = {
  play: async () => {
    const output = spyOn(console, "error").mockImplementation(() => {});
    const info = spyOn(console, "info").mockImplementation(() => {});
    try {
      const logs = createLogBucket({ name: "test", maxEntries: 2 });
      let updates = 0;
      const unsubscribe = logs.subscribe(() => updates++);
      logs.error("Failed.", "code: TEST");
      const first = logs.getSnapshot();
      await expect(logs.getSnapshot()).toBe(first);
      logs.error("Failed.", "code: TEST");
      await expect(first[0]!.count).toBe(1);
      await expect(logs.getSnapshot()).toHaveLength(1);
      await expect(logs.getSnapshot()[0]!.count).toBe(2);
      await expect(logs.getSnapshot()[0]!.timestamp).toBe(first[0]!.timestamp);
      await expect(formatLogEntries(logs.getSnapshot())).toContain(
        "(x2; last ",
      );
      await expect(output).toHaveBeenCalledTimes(2);
      await expect(output).toHaveBeenLastCalledWith(
        "[test] Failed.",
        "code: TEST",
      );
      logs.info("Other.");
      logs.error("Failed.", "code: TEST");
      await expect(logs.getSnapshot().map((entry) => entry.message)).toEqual([
        "Other.",
        "Failed.",
      ]);
      await expect(logs.getSnapshot()[1]!.count).toBe(1);
      logs.clear();
      await expect(logs.getSnapshot()).toEqual([]);
      await expect(updates).toBe(5);
      unsubscribe();
      logs.info("After unsubscribe.");
      await expect(updates).toBe(5);
      const single = createLogBucket({ name: "one", maxEntries: 1 });
      single.info("First.");
      single.info("Last.");
      await expect(single.getSnapshot()).toHaveLength(1);
      await expect(single.getSnapshot()[0]!.message).toBe("Last.");
      const defaults = createLogBucket({ name: "default" });
      for (let i = 0; i < 101; i++) {
        defaults.info(String(i));
      }
      await expect(defaults.getSnapshot()).toHaveLength(100);
      await expect(defaults.getSnapshot()[0]!.message).toBe("1");
      await expect(() =>
        createLogBucket({ name: "bad", maxEntries: 0 }),
      ).toThrow(RangeError);
    } finally {
      output.mockRestore();
      info.mockRestore();
    }
  },
};

let liveBucket: LogBucket;
function LiveLauncher() {
  const [open, setOpen] = useState(false);
  const [bucket] = useState(() => {
    const logs = createLogBucket({ name: "live" });
    for (let i = 0; i < 80; i++) {
      logs.info(`Entry ${i}: ${"long text ".repeat(30)}`);
    }
    liveBucket = logs;
    return logs;
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open logs</Button>
      {open && (
        <LogDialog
          bucket={bucket}
          title="Daemon logs"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export const LiveScrolling: Story = {
  render: () => <LiveLauncher />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open logs" }));
    const logs = canvas.getByLabelText("Log entries");
    await expect(logs.scrollWidth).toBeGreaterThan(logs.clientWidth);
    await expect(
      logs.scrollHeight - logs.scrollTop - logs.clientHeight,
    ).toBeLessThan(3);
    await act(() => liveBucket.info("Live while following."));
    await expect(logs).toHaveTextContent("Live while following.");
    await expect(
      logs.scrollHeight - logs.scrollTop - logs.clientHeight,
    ).toBeLessThan(3);
    logs.scrollTop = 0;
    logs.dispatchEvent(new Event("scroll"));
    await act(() => liveBucket.info("Live while reading history."));
    await expect(logs.scrollTop).toBe(0);
    await userEvent.type(canvas.getByRole("searchbox"), "Live");
    await waitFor(() =>
      expect(logs).toHaveTextContent("Live while reading history."),
    );
    await expect(canvas.getByText("2 / 82 entries")).toBeVisible();
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
