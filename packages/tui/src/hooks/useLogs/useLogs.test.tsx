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
const mountedProbes: ReturnType<typeof render>[] = [];

beforeAll(() => {
  logStore.destroy();
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

function renderProbe(element: React.ReactElement) {
  const renderedProbe = render(element);
  mountedProbes.push(renderedProbe);
  return renderedProbe;
}

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
    for (const mountedProbe of mountedProbes.splice(0)) {
      mountedProbe.unmount();
    }
    logStore.clear();
  });

  it("should render the current snapshot on mount", () => {
    logStore.push("info", "preexisting");
    const { lastFrame } = renderProbe(<LogProbe />);
    expect(lastFrame()).toContain("count=1");
    expect(lastFrame()).toContain("info:preexisting");
  });

  it("should re-render when a new entry is pushed", () => {
    const { lastFrame, rerender } = renderProbe(<LogProbe />);
    expect(lastFrame()).toContain("count=0");

    logStore.push("log", "from-test");
    rerender(<LogProbe />);

    expect(lastFrame()).toContain("count=1");
    expect(lastFrame()).toContain("log:from-test");
  });

  it("should re-render with multiple captured entries in order", () => {
    const { lastFrame, rerender } = renderProbe(<LogProbe />);

    logStore.push("log", "one");
    logStore.push("warn", "two");
    logStore.push("error", "three");
    rerender(<LogProbe />);

    const frame = lastFrame() ?? "";
    expect(frame).toContain("count=3");
    const orderedSegment = frame.split(" ").slice(1).join(" ");
    expect(orderedSegment).toBe("log:one|warn:two|error:three");
  });

  it("should expose a clearLogs callback that empties the store", () => {
    let capturedClear: (() => void) | undefined;
    const { lastFrame, rerender } = renderProbe(
      <ClearProbe
        onReady={(clear) => {
          capturedClear = clear;
        }}
      />,
    );

    logStore.push("log", "a");
    logStore.push("log", "b");
    rerender(
      <ClearProbe
        onReady={(clear) => {
          capturedClear = clear;
        }}
      />,
    );
    expect(lastFrame()).toContain("count=2");

    capturedClear?.();
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
    const { rerender } = renderProbe(
      <ClearProbe
        onReady={(clear) => {
          seen.push(clear);
        }}
      />,
    );

    logStore.push("log", "x");
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
    const { unmount } = renderProbe(<LogProbe />);
    unmount();
    // After unmount, pushing more entries must not throw or affect anything.
    expect(() => {
      logStore.push("log", "after-unmount");
    }).not.toThrow();
  });

  it("should support multiple mounted consumers receiving the same updates", () => {
    const firstProbe = renderProbe(<LogProbe />);
    const secondProbe = renderProbe(<LogProbe />);

    logStore.push("log", "shared");
    firstProbe.rerender(<LogProbe />);
    secondProbe.rerender(<LogProbe />);
    expect(firstProbe.lastFrame()).toContain("count=1");
    expect(firstProbe.lastFrame()).toContain("log:shared");
    expect(secondProbe.lastFrame()).toContain("count=1");
    expect(secondProbe.lastFrame()).toContain("log:shared");
  });
});
