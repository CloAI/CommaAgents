#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { runStandaloneDaemonCli } from "./daemon-cli";

runStandaloneDaemonCli({
  foregroundCommand: [
    process.execPath,
    ...(import.meta.url.endsWith(".ts") ? ["--import", "tsx"] : []),
    fileURLToPath(import.meta.url),
  ],
});
