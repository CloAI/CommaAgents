/**
 * Browser shim for `node:process` named exports.
 *
 * `vite-plugin-node-polyfills` ships a process shim with a default export
 * but does not re-export `cwd`, `env`, `platform`, etc. as named bindings,
 * which Ink and friends require. We forward to the `process` package (the
 * standard browser polyfill) and re-export the bits we need.
 *
 * Additionally, the npm `process` polyfill does NOT provide `stdin`,
 * `stdout`, or `stderr`. We attach inert stream-shaped stubs for dependencies
 * that import those process bindings. Real I/O still flows through the
 * xterm-backed stdin/stdout passed to `inkRender(...)` in `XtermInkPreview`.
 *
 * IMPORTANT: the local binding is named `nodeProcess` — NOT `process` —
 * because Vite's `define` config rewrites the literal token `process.env`
 * to an object expression inside this file, which would otherwise create
 * a temporal-dead-zone access on the local `process` identifier.
 */
import nodeProcess from "process";

/** Inert ReadStream-shaped stub for dependencies that import `process.stdin`. */
const stdinStub: NodeJS.ReadStream = Object.assign(Object.create(null), {
  isTTY: false,
  setRawMode: (_mode: boolean) => stdinStub,
  ref: () => stdinStub,
  unref: () => stdinStub,
  resume: () => stdinStub,
  pause: () => stdinStub,
  on: () => stdinStub,
  off: () => stdinStub,
  once: () => stdinStub,
  addListener: () => stdinStub,
  removeListener: () => stdinStub,
  removeAllListeners: () => stdinStub,
  read: () => null,
  readable: false,
}) as unknown as NodeJS.ReadStream;

/** Inert WriteStream-shaped stub backed by `console.log` for stray writes. */
const makeStdoutStub = (sink: (s: string) => void): NodeJS.WriteStream =>
  Object.assign(Object.create(null), {
    isTTY: false,
    columns: 80,
    rows: 24,
    write: (chunk: unknown) => {
      sink(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    },
    on: () => {},
    off: () => {},
    once: () => {},
    end: () => {},
    cursorTo: () => true,
    moveCursor: () => true,
    clearLine: () => true,
    clearScreenDown: () => true,
    getColorDepth: () => 8,
    hasColors: () => true,
  }) as unknown as NodeJS.WriteStream;

// Patch the polyfill instance once on first import. Idempotent.
if (!(nodeProcess as { stdin?: unknown }).stdin) {
  (nodeProcess as { stdin: NodeJS.ReadStream }).stdin = stdinStub;
}
if (!(nodeProcess as { stdout?: unknown }).stdout) {
  (nodeProcess as { stdout: NodeJS.WriteStream }).stdout = makeStdoutStub(
    // eslint-disable-next-line no-console
    (s) => console.log(s.replace(/\n$/, "")),
  );
}
if (!(nodeProcess as { stderr?: unknown }).stderr) {
  (nodeProcess as { stderr: NodeJS.WriteStream }).stderr = makeStdoutStub(
    // eslint-disable-next-line no-console
    (s) => console.warn(s.replace(/\n$/, "")),
  );
}

export default nodeProcess;
export const env = nodeProcess.env;
export const platform = nodeProcess.platform;
export const cwd = () => nodeProcess.cwd();
export const nextTick = nodeProcess.nextTick.bind(nodeProcess);
export const stdout = (nodeProcess as unknown as { stdout: NodeJS.WriteStream })
  .stdout;
export const stderr = (nodeProcess as unknown as { stderr: NodeJS.WriteStream })
  .stderr;
export const stdin = (nodeProcess as unknown as { stdin: NodeJS.ReadStream })
  .stdin;
export const versions = nodeProcess.versions;
export const version = nodeProcess.version;
export const argv = nodeProcess.argv;
