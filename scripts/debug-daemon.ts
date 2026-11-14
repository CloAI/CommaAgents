import { loadDaemonConfig } from "../packages/daemon/src/config";
import { startDaemonRuntime } from "../packages/daemon/src/daemon-cli/runtime";

await startDaemonRuntime(loadDaemonConfig({ env: process.env }));
