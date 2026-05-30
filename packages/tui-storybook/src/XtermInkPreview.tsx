import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { render as inkRender } from "ink";
import { type ReactNode, useEffect, useRef } from "react";
import { MouseProvider } from "../../tui/src/components/MouseProvider";
import { ModalProvider } from "../../tui/src/hooks/useModal";
import { ThemeProvider } from "../../tui/src/theme";
import { createStdinShim } from "./shims/stdin";
import { createStdoutShim } from "./shims/stdout";

/**
 * Wraps story content in the canonical provider tree expected by every
 * `@comma-agents/tui` component: `ThemeProvider > MouseProvider > ModalProvider`.
 * Mirrors the order used in `bootstrap.tsx` so stories behave identically
 * to a live TUI session.
 */
function StoryProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <MouseProvider>
        <ModalProvider>{children}</ModalProvider>
      </MouseProvider>
    </ThemeProvider>
  );
}

export interface XtermInkPreviewProps {
  /** Story content — a single Ink component tree. */
  readonly children: ReactNode;
  /** Initial column count for the emulated terminal. */
  readonly cols?: number;
  /** Initial row count for the emulated terminal. */
  readonly rows?: number;
  /** Whether to fit the terminal to its container on mount. */
  readonly fit?: boolean;
}

/**
 * Bridges an Ink render tree into an xterm.js terminal rendered in the
 * browser. Used as a global Storybook decorator so every story runs inside
 * a real ANSI-rendering preview surface — including keyboard, mouse and
 * scroll input forwarded through the existing `MouseProvider` infrastructure
 * in `@comma-agents/tui`.
 *
 * Lifecycle:
 * 1. Mount: create `Terminal`, build stdout/stdin shims, call Ink's `render`.
 * 2. Re-render: when `children` changes, the existing Ink instance is
 *    re-rendered via `instance.rerender` — preserving terminal scrollback.
 * 3. Unmount: unmount Ink, dispose shims, dispose terminal.
 */
export function XtermInkPreview({
  children,
  cols = 80,
  rows = 24,
  fit = false,
}: XtermInkPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const inkRef = useRef<ReturnType<typeof inkRender> | null>(null);

  // Mount terminal + Ink once per host element.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      cols,
      rows,
      convertEol: true,
      cursorBlink: true,
      allowProposedApi: true,
      fontFamily: '"JetBrains Mono", "Menlo", "Consolas", monospace',
      fontSize: 14,
      theme: { background: "#0b0b0b" },
    });

    const fitAddon = fit ? new FitAddon() : null;
    if (fitAddon) term.loadAddon(fitAddon);
    term.open(host);
    fitAddon?.fit();
    term.focus();

    // Enable SGR mouse tracking on the xterm side. In the real TUI, `Frame`
    // writes these escape sequences for the lifetime of the component —
    // they tell xterm.js to start emitting button (incl. wheel) and
    // motion events as SGR-encoded data on its data channel. Without this,
    // trackpad/wheel scroll inside stories never produces input for Ink's
    // `MouseProvider` to parse.
    //
    //   ?1000h — send button-press and release events
    //   ?1003h — send any-event motion (used by hover)
    //   ?1006h — use SGR (1006) extended encoding (what `parseMouseEvents` expects)
    term.write("\x1b[?1000h\x1b[?1003h\x1b[?1006h");

    const stdout = createStdoutShim(term);
    const stdin = createStdinShim(term);

    const instance = inkRender(<StoryProviders>{children}</StoryProviders>, {
      stdout: stdout as any,
      stdin: stdin as any,
      patchConsole: false,
      exitOnCtrlC: false,
    });
    inkRef.current = instance;

    return () => {
      instance.unmount();
      inkRef.current = null;
      stdin.dispose();
      stdout.dispose();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, cols, fit, rows]);

  // Re-render Ink when story children change without remounting the terminal.
  useEffect(() => {
    inkRef.current?.rerender(<StoryProviders>{children}</StoryProviders>);
  }, [children]);

  return <div ref={hostRef} className="xterm-host" />;
}
