/**
 * Example 03 — Interactive Flow (User Input)
 *
 * Demonstrates handling `request_input` events from the daemon. When a
 * strategy includes a UserAgent, the daemon pauses execution and broadcasts
 * a `request_input` message. The client responds with a `user_input` message
 * to continue the flow.
 *
 * This example uses a simple readline loop to prompt the user in the terminal,
 * then sends their input back to the daemon.
 *
 * Prerequisites:
 *   1. Start the daemon: bun run --cwd packages/daemon start
 *   2. A strategy file with a UserAgent step (e.g., a cycle flow that asks
 *      the user for feedback each iteration). See the strategy YAML below.
 *   3. Set up provider API keys (e.g., OPENAI_API_KEY)
 *
 * Run:
 *   bun run examples/03-interactive-flow.ts [strategy-path]
 *   bun run examples/03-interactive-flow.ts --daemon-url ws://localhost:8080/ws
 *
 * If no strategy-path is given, this example writes a temporary strategy
 * to /tmp and uses it automatically.
 *
 * Concepts:
 *   - request_input daemon message
 *   - user_input client message
 *   - Interactive agent loops with human-in-the-loop feedback
 *   - Readline integration for terminal input
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const argv = yargs(hideBin(process.argv))
  .scriptName("03-interactive-flow")
  .usage("$0 [strategy-path]")
  .command(
    "$0 [strategy-path]",
    "Run an interactive flow with user input via the daemon",
    (y) =>
      y.positional("strategy-path", {
        type: "string",
        describe: "Path to a strategy file (writes a temp one if omitted)",
      }),
  )
  .option("daemon-url", {
    alias: "d",
    type: "string",
    default: process.env.DAEMON_URL ?? "ws://127.0.0.1:7422/ws",
    describe: "WebSocket URL of the daemon",
  })
  .option("model-override", {
    alias: "m",
    type: "string",
    default: process.env.MODEL,
    describe:
      'Override the model for all agents (e.g. "anthropic/claude-sonnet-4-20250514"). Also reads MODEL env var.',
  })
  .example("$0", "Run with auto-generated interactive strategy")
  .example("$0 path/to/strategy.json", "Run a specific interactive strategy")
  .strict()
  .help()
  .alias("h", "help")
  .version(false)
  .parseSync();

const DAEMON_URL = argv.daemonUrl as string;
const MODEL_OVERRIDE = argv.modelOverride as string | undefined;

// -- Temporary strategy with a UserAgent ------------------------------------

const INTERACTIVE_STRATEGY = {
  name: "interactive-qa",
  version: "1.0",
  description: "A Q&A agent that asks the user for follow-up questions.",
  agents: {
    assistant: {
      model: "openai/gpt-4o",
      systemPrompt:
        "You are a helpful assistant. Answer the user's question concisely.",
    },
    user: {
      type: "user",
      config: {
        requireInput: true,
      },
    },
  },
  flow: {
    name: "Interactive Q&A",
    type: "sequential",
    steps: [{ agent: "assistant" }, { agent: "user" }],
  },
};

function getStrategyPath(): string {
  const explicit = argv.strategyPath as string | undefined;
  if (explicit) return path.resolve(explicit);

  // Write a temporary strategy file
  const tmpPath = path.join(
    os.tmpdir(),
    "comma-agents-interactive-strategy.json",
  );
  fs.writeFileSync(
    tmpPath,
    JSON.stringify(INTERACTIVE_STRATEGY, null, 2),
    "utf-8",
  );
  console.log(`Wrote temporary strategy to ${tmpPath}`);
  return tmpPath;
}

// -- Readline helper --------------------------------------------------------

function askUser(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// -- Main -------------------------------------------------------------------

async function main() {
  const strategyPath = getStrategyPath();
  console.log(`Connecting to daemon at ${DAEMON_URL}...`);
  console.log(`Strategy: ${strategyPath}`);
  if (MODEL_OVERRIDE) console.log(`Model override: ${MODEL_OVERRIDE}`);
  console.log();

  const ws = new WebSocket(DAEMON_URL);
  let currentRunId: string | undefined;

  ws.onopen = () => {
    console.log("Connected. Starting interactive flow...\n");

    ws.send(
      JSON.stringify({
        type: "start_strategy",
        strategyPath,
        input: "What is the capital of France?",
        requestId: "interactive-1",
        ...(MODEL_OVERRIDE ? { modelOverride: MODEL_OVERRIDE } : {}),
      }),
    );
  };

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data as string);

    switch (msg.type) {
      case "pong":
        break;

      case "strategy_started":
        currentRunId = msg.runId;
        console.log(`Strategy started: ${msg.strategyName}`);
        console.log(`Agents: ${msg.agents.join(", ")}\n`);
        break;

      case "step_started":
        console.log(`── ${msg.stepName} ──`);
        break;

      case "agent_output":
        console.log(`${msg.agentName}: ${msg.text}\n`);
        break;

      case "agent_streaming": {
        if (msg.event.type === "text") {
          process.stdout.write(msg.event.text);
        }
        break;
      }

      case "step_completed":
        // Step finished, result already shown via agent_output or streaming
        break;

      // ── The key event: daemon is asking for user input ──
      case "request_input": {
        console.log(`\n[Daemon requests input for agent "${msg.agentName}"]`);
        const prompt = msg.prompt ?? "Your input: ";
        const answer = await askUser(`  ${prompt} `);

        if (answer.trim().toLowerCase() === "done") {
          console.log("\nUser chose to end. Stopping flow...");
          if (currentRunId) {
            ws.send(
              JSON.stringify({
                type: "stop_strategy",
                runId: currentRunId,
              }),
            );
          }
          // Still send the input so the bridge unblocks
          ws.send(
            JSON.stringify({
              type: "user_input",
              runId: msg.runId,
              agentName: msg.agentName,
              text: answer,
            }),
          );
        } else {
          ws.send(
            JSON.stringify({
              type: "user_input",
              runId: msg.runId,
              agentName: msg.agentName,
              text: answer,
            }),
          );
        }
        break;
      }

      case "strategy_completed":
        console.log(`\nStrategy completed (run: ${msg.runId})`);
        console.log(`Result: ${msg.result}`);
        console.log(
          `Usage: ${msg.usage.promptTokens} prompt + ${msg.usage.completionTokens} completion`,
        );
        ws.close();
        break;

      case "strategy_error":
        console.error(
          `\nStrategy error: ${msg.error.code} — ${msg.error.message}`,
        );
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
    process.exit(0);
  };
}

main().catch(console.error);
