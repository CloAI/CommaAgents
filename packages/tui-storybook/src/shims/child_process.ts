/**
 * Browser stub for `node:child_process`.
 *
 * Some of Ink's transitive deps (e.g. `terminal-size`) probe for terminal
 * dimensions via `execFileSync`. Inside the browser we never actually need
 * to spawn anything — Ink reads dimensions from `stdout.columns/rows`,
 * which our xterm shim populates. So we just throw a clear error if anyone
 * actually invokes these, and otherwise return safe defaults.
 */
const stub = (name: string) => () => {
  throw new Error(`[tui-storybook] node:child_process.${name} is not available in the browser preview`);
};

export const execFileSync = stub("execFileSync");
export const execSync = stub("execSync");
export const spawnSync = stub("spawnSync");
export const exec = stub("exec");
export const execFile = stub("execFile");
export const spawn = stub("spawn");
export const fork = stub("fork");

export default {
  execFileSync,
  execSync,
  spawnSync,
  exec,
  execFile,
  spawn,
  fork,
};
