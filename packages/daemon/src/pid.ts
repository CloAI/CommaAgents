// PID file management — re-exports from @comma-agents/utils.
//
// Used by the CLI to track the daemon process. The PID file stores a single
// integer (the daemon's process ID) at a configurable path (default:
// ~/.local/share/comma-agents/daemon.pid on Linux).

export { isRunning, readPid, removePid, writePid } from "@comma-agents/utils";
