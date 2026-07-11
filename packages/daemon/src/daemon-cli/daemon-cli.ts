#!/usr/bin/env bun

import { runStandaloneDaemonCli } from ".";

runStandaloneDaemonCli({
  foregroundCommand: [process.execPath, "run", import.meta.path],
});
