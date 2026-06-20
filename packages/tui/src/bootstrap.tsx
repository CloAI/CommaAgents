import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runTui } from "./run-tui";

const commandArguments = yargs(hideBin(process.argv))
  .scriptName("comma-agents-tui")
  .usage("$0 [options]")
  .option("strategy", {
    alias: "s",
    type: "string",
    describe: "Strategy name to run",
  })
  .option("daemon-url", {
    alias: "d",
    type: "string",
    describe: "Daemon WebSocket URL",
    default: "ws://localhost:7422/ws",
  })
  .option("input", {
    alias: "i",
    type: "string",
    describe: "Initial input message",
  })
  .option("dev", {
    alias: "D",
    type: "boolean",
    default: false,
    describe: "Enable the component playground",
  })
  .strict()
  .help()
  .alias("h", "help")
  .version(process.env.COMMA_BUILD_VERSION ?? "development")
  .parseSync();

runTui({
  strategy: commandArguments.strategy,
  input: commandArguments.input,
  daemonUrl: commandArguments.daemonUrl,
  dev: commandArguments.dev,
});
