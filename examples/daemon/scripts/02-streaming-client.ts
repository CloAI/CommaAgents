/**
 * Example 02 — Streaming Client
 *
 * Demonstrates consuming real-time streaming events from the daemon.
 * As the agent generates tokens, the daemon sends `agent_streaming` messages
 * with individual text chunks, tool calls, and tool results.
 *
 * This example renders a live-updating output in the terminal by writing
 * text deltas without newlines, then printing the final result when done.
 *
 * Prerequisites:
 *   1. Start the daemon: bun run --cwd packages/daemon start
 *   2. Ensure a strategy file exists (e.g., ../../examples/core/simple/strategy.json)
 *   3. Set up provider API keys (e.g., OPENAI_API_KEY)
 *
 * Run:
 *   bun run examples/02-streaming-client.ts [strategy-path]
 *   bun run examples/02-streaming-client.ts --daemon-url ws://localhost:8080/ws
 *
 * Concepts:
 *   - agent_streaming message with text / tool-call / tool-result / done events
 *   - Live terminal rendering of streamed tokens
 *   - Handling request_input (auto-replying with the initial prompt)
 *   - Correlating streaming events with step lifecycle events
 */

import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const DEFAULT_STRATEGY = path.resolve(
  import.meta.dir,
  "../../core/strategies/simple/strategy.json",
);

const argv = yargs(hideBin(process.argv))
  .scriptName("02-streaming-client")
  .usage("$0 [strategy-path]")
  .command("$0 [strategy-path]", "Stream tokens from a daemon strategy execution", (y) =>
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
  .example("$0", "Stream with default strategy")
  .example("$0 path/to/strategy.json", "Stream a specific strategy")
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
  console.log(`Strategy: ${strategyPath}`);
  console.log("Streaming mode — tokens will appear as they arrive.\n");

  const ws = new WebSocket(DAEMON_URL);
  let totalTokens = 0;

  // The initial prompt — re-used as a reply when the strategy includes
  // a UserAgent step that requests input.
  const initialInput = "Write a short haiku about programming.";

  ws.onopen = () => {
    console.log("Connected. Starting flow...\n");
    console.log("─".repeat(60));

    ws.send(
      JSON.stringify({
        type: "start_flow",
        strategyPath,
        input: initialInput,
        requestId: "stream-1",
      }),
    );
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data as string);

    switch (msg.type) {
      case "pong":
        // Ignore keepalive responses
        break;

      case "flow_started":
        console.log(`Flow started: ${msg.strategyName} (run: ${msg.runId})`);
        console.log("─".repeat(60));
        break;

      case "step_started":
        console.log(`\n[${msg.stepName}] generating...`);
        break;

      case "agent_streaming": {
        const evt = msg.event;
        switch (evt.type) {
          case "text":
            // Write text deltas directly — no newline, so they accumulate
            process.stdout.write(evt.text);
            break;

          case "tool-call":
            console.log(`\n  ⚙ tool call: ${evt.toolName}(${evt.args})`);
            break;

          case "tool-result":
            console.log(`  ✓ tool result [${evt.toolName}]: ${evt.output.slice(0, 100)}`);
            break;

          case "step-start":
            // New generation step (multi-step tool use)
            break;

          case "done":
            // Stream finished for this agent
            totalTokens += evt.result.usage.promptTokens + evt.result.usage.completionTokens;
            break;
        }
        break;
      }

      case "step_completed":
        console.log(`\n[${msg.stepName}] done (${msg.result.finishReason})`);
        break;

      case "agent_output":
        // Non-streaming agent output — already captured via streaming above
        break;

      // If the strategy includes a UserAgent step, the daemon asks the
      // client for input. We auto-reply with the initial prompt so the
      // flow continues without manual intervention.
      case "request_input":
        console.log(`\n[request_input] Agent "${msg.agentName}" — auto-replying`);
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
        console.log(`\n${"─".repeat(60)}`);
        console.log(`Flow completed (run: ${msg.runId})`);
        console.log(`Final result: ${msg.result}`);
        console.log(
          `Total usage: ${msg.usage.promptTokens} prompt + ${msg.usage.completionTokens} completion tokens`,
        );
        console.log(`Tokens seen in stream events: ${totalTokens}`);
        ws.close();
        break;

      case "flow_error":
        console.error(`\nFlow error: ${msg.error.code} — ${msg.error.message}`);
        ws.close();
        process.exit(1);
        break;

      case "error":
        console.error(`Error: ${msg.code} — ${msg.message}`);
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
    console.log("\nDisconnected.");
  };
}

main().catch(console.error);
