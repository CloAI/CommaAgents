// Enable React act() environment for bun:test
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";
import { act } from "react";

import { logStore } from "./logStore";
import { useLogs } from "./useLogs";

// Importing `logStore.ts` permanently hijacks the global console at module
// load time, which interferes with bun:test's own console-based reporting.
// Restore the real console for the duration of the suite — we exercise the
// hook by pushing entries directly into the store with `logStore.push`, which
// does not depend on the console hijack being active.
const hijackedConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

beforeAll(() => {
  logStore.destroy();
  // Now that the singleton's hijack is gone, install an act()-warning
  // suppression wrapper on the real `console.error`. The assertions
  // themselves are wrapped in act(), but mutations performed in
  // beforeEach/afterEach intentionally are not, and those produce noise.
  const realConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("was not wrapped in act")
    )
      return;
    realConsoleError(...args);
  };
});

afterAll(() => {
  // Reinstall the hijacked methods so any subsequent test files see the
  // singleton in roughly the state they would expect.
  console.log = hijackedConsole.log;
  console.info = hijackedConsole.info;
  console.warn = hijackedConsole.warn;
  console.error = hijackedConsole.error;
  console.debug = hijackedConsole.debug;
});

/**
 * Tiny Ink component that exposes the hook's state so the test can read it
 * out of the rendered frame.
 */
function LogProbe(): React.ReactElement {
  const { logs } = useLogs();
  const summary = logs
    .map((entry) => `${entry.level}:${entry.message}`)
    .join("|");
  return <Text>{`count=${logs.length} ${summary}`}</Text>;
}

function ClearProbe(props: {
  readonly onReady: (clear: () => void) => void;
}): React.ReactElement {
  const { logs, clearLogs } = useLogs();
  // Hand the clear function up to the test on every render — React guarantees
  // the same identity across renders thanks to useCallback in the hook.
  props.onReady(clearLogs);
  return <Text>{`count=${logs.length}`}</Text>;
}

describe("useLogs", () => {
  beforeEach(() => {
    logStore.clear();
  });

  afterEach(() => {
    logStore.clear();
  });

  it("should render the current snapshot on mount", () => {
    logStore.push("info", "preexisting");
    const { lastFrame } = render(<LogProbe />);
    expect(lastFrame()).toContain("count=1");
    expect(lastFrame()).toContain("info:preexisting");
  });

  it("should re-render when a new entry is pushed", () => {
    const { lastFrame, rerender } = render(<LogProbe />);
    expect(lastFrame()).toContain("count=0");

    act(() => {
      logStore.push("log", "from-test");
    });
    rerender(<LogProbe />);

    expect(lastFrame()).toContain("count=1");
    expect(lastFrame()).toContain("log:from-test");
  });

  it("should re-render with multiple captured entries in order", () => {
    const { lastFrame, rerender } = render(<LogProbe />);

    act(() => {
      logStore.push("log", "one");
      logStore.push("warn", "two");
      logStore.push("error", "three");
    });
    rerender(<LogProbe />);

    const frame = lastFrame() ?? "";
    expect(frame).toContain("count=3");
    const orderedSegment = frame.split(" ").slice(1).join(" ");
    expect(orderedSegment).toBe("log:one|warn:two|error:three");
  });

  it("should expose a clearLogs callback that empties the store", () => {
    let capturedClear: (() => void) | undefined;
    const { lastFrame, rerender } = render(
      <ClearProbe
        onReady={(clear) => {
          capturedClear = clear;
        }}
      />,
    );

    act(() => {
      logStore.push("log", "a");
      logStore.push("log", "b");
    });
    rerender(
      <ClearProbe
        onReady={(clear) => {
          capturedClear = clear;
        }}
      />,
    );
    expect(lastFrame()).toContain("count=2");

    act(() => {
      capturedClear?.();
    });
    rerender(
      <ClearProbe
        onReady={(clear) => {
          capturedClear = clear;
        }}
      />,
    );
    expect(lastFrame()).toContain("count=0");
  });

  it("should keep the same clearLogs reference across renders", () => {
    const seen: Array<() => void> = [];
    const { rerender } = render(
      <ClearProbe
        onReady={(clear) => {
          seen.push(clear);
        }}
      />,
    );

    act(() => {
      logStore.push("log", "x");
    });
    rerender(
      <ClearProbe
        onReady={(clear) => {
          seen.push(clear);
        }}
      />,
    );

    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0]).toBe(seen[seen.length - 1]);
  });

  it("should unsubscribe when unmounted (no leak, no errors)", () => {
    const { unmount } = render(<LogProbe />);
    unmount();
    // After unmount, pushing more entries must not throw or affect anything.
    expect(() => {
      logStore.push("log", "after-unmount");
    }).not.toThrow();
  });

  it("should support multiple mounted consumers receiving the same updates", () => {
    const a = render(<LogProbe />);
    const b = render(<LogProbe />);

    act(() => {
      logStore.push("log", "shared");
    });
    a.rerender(<LogProbe />);
    b.rerender(<LogProbe />);

    expect(a.lastFrame()).toContain("count=1");
    expect(a.lastFrame()).toContain("log:shared");
    expect(b.lastFrame()).toContain("count=1");
    expect(b.lastFrame()).toContain("log:shared");

    a.unmount();
    b.unmount();
  });
});
