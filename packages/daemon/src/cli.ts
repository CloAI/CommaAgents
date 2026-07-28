#!/usr/bin/env bun

import { runStandaloneDaemonCli } from "./daemon-cli";

runStandaloneDaemonCli({
  foregroundCommand: [process.execPath, "run", import.meta.path],
});
