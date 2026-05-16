import type { Terminal } from "@xterm/xterm";
import { Readable } from "readable-stream";

/**
 * A `process.stdin`-compatible Readable backed by xterm.js keyboard / mouse data.
 *
 * Ink uses raw-mode TTY input. We emulate enough of `tty.ReadStream` to satisfy:
 * - `setRawMode(true|false)` — required by Ink before subscribing to keys.
 * - `resume()` / `pause()` — Ink toggles flow when its app mounts/unmounts.
 * - `isTTY === true` — Ink's feature detection short-circuits otherwise.
 *
 * Every byte xterm.js produces (typed keys, pasted text, **and** SGR mouse
 * sequences when ?1003h is active) is pushed into the stream. The existing
 * `MouseProvider` in `@comma-agents/tui` parses those mouse sequences directly
 * — so no special handling is needed at this layer.
 */
export interface StdinShim extends Readable {
  isTTY: true;
  setRawMode: (mode: boolean) => StdinShim;
  ref: () => void;
  unref: () => void;
  /** Removes the xterm data subscription. */
  dispose: () => void;
}

export function createStdinShim(term: Terminal): StdinShim {
  const stream = new Readable({
    // We push manually as xterm emits data; the consumer only needs flow.
    read() {},
  }) as StdinShim;

  stream.isTTY = true;
  stream.setRawMode = () => stream; // No-op: xterm is always "raw".
  stream.ref = () => {};
  stream.unref = () => {};

  const sub = term.onData((data) => {
    stream.push(data);
  });

  stream.dispose = () => {
    sub.dispose();
    stream.push(null);
  };

  return stream;
}
