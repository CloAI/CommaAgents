import { Writable } from "readable-stream";
import type { Terminal } from "@xterm/xterm";

/**
 * A `process.stdout`-compatible Writable backed by an xterm.js `Terminal`.
 *
 * Ink writes ANSI-encoded frames here; we forward them to xterm which
 * renders the result. `columns`/`rows`/`isTTY` are mirrored so Ink's layout
 * engine sizes itself to the visible terminal.
 *
 * Resize is forwarded by emitting the `'resize'` event whenever the terminal
 * dimensions change — matching Node's TTY behaviour so Ink's `useStdout`
 * subscribers update correctly.
 */
export interface StdoutShim extends Writable {
  columns: number;
  rows: number;
  isTTY: true;
  /** Disposes the resize listener attached to the terminal. */
  dispose: () => void;
}

export function createStdoutShim(term: Terminal): StdoutShim {
  const stream = new Writable({
    decodeStrings: false,
    write(chunk: unknown, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
      const text = typeof chunk === "string" ? chunk : (chunk as Buffer).toString("utf8");
      term.write(text);
      cb();
    },
  }) as StdoutShim;

  stream.columns = term.cols;
  stream.rows = term.rows;
  stream.isTTY = true;

  const sub = term.onResize(({ cols, rows }) => {
    stream.columns = cols;
    stream.rows = rows;
    stream.emit("resize");
  });

  stream.dispose = () => sub.dispose();
  return stream;
}
