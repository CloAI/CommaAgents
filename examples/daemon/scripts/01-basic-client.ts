/**
 * Example 01 — Basic Daemon Client
 *
 * Demonstrates connecting to a running comma-agents daemon via WebSocket,
 * starting a strategy execution, and receiving the result.
 *
 * Prerequisites:
 *   1. Start the daemon: bun run --cwd packages/daemon start
 *   2. Ensure a strategy file exists (e.g., ../../examples/core/simple/strategy.json)
 *   3. Set up provider API keys (e.g., OPENAI_API_KEY)
 *
 * Run:
 *   bun run examples/01-basic-client.ts [strategy-path]
 *   bun run examples/01-basic-client.ts --daemon-url ws://localhost:8080/ws
 *
 * Concepts:
 *   - WebSocket connection to the daemon
 *   - start_flow message to execute a strategy
 *   - Handling request_input (auto-replying with the initial prompt)
 *   - Handling flow_started, flow_completed, and flow_error events
 *   - ping/pong keepalive
 */

import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const DEFAULT_STRATEGY = path.resolve(
  import.meta.dir,
  "../../core/strategies/simple/strategy.json",
);

const argv = yargs(hideBin(process.argv))
  .scriptName("01-basic-client")
  .usage("$0 [strategy-path]")
  .command("$0 [strategy-path]", "Connect to the daemon and run a strategy", (y) =>
    y.positional("strategy-path", {
      type: "string",
      describe: "Path to the strategy file",
      default: DEFAULT_STRATEGY,
    }),
  )
  .option("daemon-url", {
    alias: "d",
    type: "string",
    default: process.env.DAEMON_URL ?? "ws://127.0.0.1:7422/ws",
    describe: "WebSocket URL of the daemon",
  })
  .example("$0", "Run with default strategy")
  .example("$0 path/to/strategy.json", "Run a specific strategy")
  .example("$0 --daemon-url ws://localhost:8080/ws", "Connect to a custom daemon")
  .strict()
  .help()
  .alias("h", "help")
  .version(false)
  .parseSync();

const DAEMON_URL = argv.daemonUrl as string;
const STRATEGY_PATH = argv.strategyPath as string;

async function main() {
  const strategyPath = path.resolve(STRATEGY_PATH);
  console.log(`Connecting to daemon at ${DAEMON_URL}...`);
  console.log(`Strategy: ${strategyPath}\n`);

  const ws = new WebSocket(DAEMON_URL);

  // The initial prompt we send in start_flow — re-used as a reply if
  // the strategy includes a UserAgent step that requests input.
  const initialInput = "Hello! What can you help me with?";

  // Track the run ID so we can correlate events
  let _runId: string | undefined;

  ws.onopen = () => {
    console.log("Connected to daemon.\n");

    // Send a ping to verify connectivity
    ws.send(JSON.stringify({ type: "ping", requestId: "hello" }));

    // Start the flow
    ws.send(
      JSON.stringify({
        type: "start_flow",
        strategyPath,
        input: initialInput,
        requestId: "flow-1",
      }),
    );
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data as string);

    switch (msg.type) {
      case "pong":
        console.log(`[pong] Daemon is alive (ts: ${msg.ts})`);
        break;

      case "flow_started":
        _runId = msg.runId;
        console.log(`[flow_started] Run: ${msg.runId}`);
        console.log(`  Strategy: ${msg.strategyName}`);
        console.log(`  Agents: ${msg.agents.join(", ")}\n`);
        break;

      case "step_started":
        console.log(`[step_started] ${msg.stepName}`);
        break;

      case "step_completed":
        console.log(`[step_completed] ${msg.stepName}`);
        console.log(`  Result: ${msg.result.text.slice(0, 100)}...`);
        break;

      case "agent_output":
        console.log(`[agent_output] ${msg.text.slice(0, 200)}`);
        break;

      // If the strategy includes a UserAgent step, the daemon asks the
      // client for input. We auto-reply with the initial prompt so the
      // flow continues without manual intervention.
      case "request_input":
        console.log(`[request_input] Agent "${msg.agentName}" asks for input — auto-replying`);
        ws.send(
          JSON.stringify({
            type: "user_input",
            runId: msg.runId,
            agentName: msg.agentName,
            text: initialInput,
          }),
        );
        break;

      case "flow_completed":
        console.log(`\n[flow_completed] Run: ${msg.runId}`);
        console.log(`  Result: ${msg.result}`);
        console.log(
          `  Usage: ${msg.usage.promptTokens} prompt + ${msg.usage.completionTokens} completion tokens`,
        );
        ws.close();
        break;

      case "flow_error":
        console.error(`\n[flow_error] Run: ${msg.runId}`);
        console.error(`  Code: ${msg.error.code}`);
        console.error(`  Message: ${msg.error.message}`);
        ws.close();
        process.exit(1);
        break;

      case "error":
        console.error(`[error] ${msg.code}: ${msg.message}`);
        break;

      default:
        console.log(`[${msg.type}]`, JSON.stringify(msg).slice(0, 100));
    }
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    process.exit(1);
  };

  ws.onclose = () => {
    console.log("\nDisconnected from daemon.");
  };
}

main().catch(console.error);
