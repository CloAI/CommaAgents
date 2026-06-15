/**
 * Example 04 — Multi-Flow Client
 *
 * Demonstrates running multiple strategy flows concurrently through a single
 * daemon connection. Shows how to:
 *
 *   - Start several strategies in parallel
 *   - Use `requestId` to correlate start responses
 *   - Track multiple `runId`s and route events to the right handler
 *   - Subscribe to a strategy started by another client
 *   - List active strategies with `list_strategies`
 *
 * Prerequisites:
 *   1. Start the daemon: bun run --cwd packages/daemon start
 *   2. Ensure strategy files exist (or use the defaults below)
 *   3. Set up provider API keys (e.g., OPENAI_API_KEY)
 *
 * Run:
 *   bun run examples/04-multi-flow.ts [strategy-path]
 *   bun run examples/04-multi-flow.ts --daemon-url ws://localhost:8080/ws
 *
 * Concepts:
 *   - Concurrent strategy execution
 *   - requestId / runId correlation
 *   - list_strategies + strategy_list messages
 *   - subscribe / unsubscribe
 *   - Tracking per-flow state on the client side
 */

import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const DEFAULT_STRATEGY = path.resolve(
  import.meta.dir,
  "../../core/strategies/simple/strategy.json",
);

const argv = yargs(hideBin(process.argv))
  .scriptName("04-multi-flow")
  .usage("$0 [strategy-path]")
  .command(
    "$0 [strategy-path]",
    "Run multiple flows concurrently through the daemon",
    (y) =>
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
  .option("model-override", {
    alias: "m",
    type: "string",
    default: process.env.MODEL,
    describe:
      'Override the model for all agents (e.g. "anthropic/claude-sonnet-4-20250514"). Also reads MODEL env var.',
  })
  .example("$0", "Run 3 parallel flows with default strategy")
  .example("$0 path/to/strategy.json", "Run with a specific strategy")
  .strict()
  .help()
  .alias("h", "help")
  .version(false)
  .parseSync();

const DAEMON_URL = argv.daemonUrl as string;
const STRATEGY_PATH = argv.strategyPath as string;
const MODEL_OVERRIDE = argv.modelOverride as string | undefined;

// -- Per-flow tracking ------------------------------------------------------

interface FlowTracker {
  requestId: string;
  runId?: string;
  label: string;
  input: string;
  status: "starting" | "running" | "completed" | "error";
  stepCount: number;
}

const flows = new Map<string, FlowTracker>();
// Map requestId → tracker so we can assign the runId when flow_started arrives
const pendingByRequestId = new Map<string, FlowTracker>();

function createTracker(
  requestId: string,
  label: string,
  input: string,
): FlowTracker {
  const tracker: FlowTracker = {
    requestId,
    label,
    input,
    status: "starting",
    stepCount: 0,
  };
  flows.set(requestId, tracker);
  pendingByRequestId.set(requestId, tracker);
  return tracker;
}

function findTracker(runId: string): FlowTracker | undefined {
  for (const t of flows.values()) {
    if (t.runId === runId) return t;
  }
  return undefined;
}

function printStatus() {
  console.log("\n┌─ Flow Status ─────────────────────────────────────┐");
  for (const t of flows.values()) {
    const id = t.runId ? t.runId.slice(0, 8) : "pending ";
    console.log(
      `│  [${id}] ${t.label.padEnd(20)} ${t.status.padEnd(10)} steps: ${t.stepCount}`,
    );
  }
  console.log("└───────────────────────────────────────────────────┘\n");
}

// -- Main -------------------------------------------------------------------

async function main() {
  const strategyPath = path.resolve(STRATEGY_PATH);
  console.log(`Connecting to daemon at ${DAEMON_URL}...`);
  console.log(`Strategy: ${strategyPath}`);
  if (MODEL_OVERRIDE) console.log(`Model override: ${MODEL_OVERRIDE}`);
  console.log();

  const ws = new WebSocket(DAEMON_URL);
  let completedCount = 0;
  const totalFlows = 3;

  ws.onopen = () => {
    console.log("Connected. Starting 3 strategies in parallel...\n");

    // Start three strategies with different inputs, each with a unique requestId
    const inputs = [
      { id: "flow-a", label: "Haiku", input: "Write a haiku about the ocean." },
      {
        id: "flow-b",
        label: "Joke",
        input: "Tell me a short programming joke.",
      },
      {
        id: "flow-c",
        label: "Fact",
        input: "Give me one fun fact about space.",
      },
    ];

    for (const { id, label, input } of inputs) {
      createTracker(id, label, input);
      ws.send(
        JSON.stringify({
          type: "prepare_run",
          runId: id,
          strategyPath,
          requestId: id,
          ...(MODEL_OVERRIDE ? { modelOverride: MODEL_OVERRIDE } : {}),
        }),
      );
    }

    // Also request the strategy list after a short delay, to show list_strategies usage
    setTimeout(() => {
      console.log("Requesting strategy list...");
      ws.send(JSON.stringify({ type: "list_strategies", requestId: "list-1" }));
    }, 500);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data as string);

    switch (msg.type) {
      case "run_prepared": {
        const tracker = flows.get(msg.runId);
        if (tracker) tracker.runId = msg.runId;
        ws.send(
          JSON.stringify({
            type: "start_run",
            runId: msg.runId,
            input: tracker?.input ?? "",
            requestId: msg.requestId,
          }),
        );
        break;
      }

      case "pong":
        break;

      case "strategy_started": {
        const tracker = findTracker(msg.runId);
        if (tracker) {
          tracker.status = "running";
          pendingByRequestId.delete(tracker.requestId);
        }
        console.log(
          `[strategy_started] ${msg.strategyName} → run ${msg.runId.slice(0, 8)}`,
        );
        break;
      }

      case "step_started": {
        const t = findTracker(msg.runId);
        if (t) t.stepCount++;
        break;
      }

      case "step_completed": {
        const t = findTracker(msg.runId);
        if (t) {
          console.log(
            `  [${t.label}] step done: ${msg.result.text.slice(0, 60)}...`,
          );
        }
        break;
      }

      case "agent_output": {
        const t = findTracker(msg.runId);
        const label = t?.label ?? msg.runId.slice(0, 8);
        console.log(`  [${label}] output: ${msg.text.slice(0, 80)}`);
        break;
      }

      case "agent_streaming":
        // In multi-flow mode we skip streaming to keep output clean
        break;

      // If the strategy includes a UserAgent step, auto-reply with the
      // flow's original input so execution continues without blocking.
      case "request_input": {
        const t = findTracker(msg.runId);
        const replyText = t?.input ?? "continue";
        ws.send(
          JSON.stringify({
            type: "user_input",
            runId: msg.runId,
            agentName: msg.agentName,
            text: replyText,
          }),
        );
        break;
      }

      case "strategy_completed": {
        const t = findTracker(msg.runId);
        if (t) t.status = "completed";
        completedCount++;

        const label = t?.label ?? msg.runId.slice(0, 8);
        console.log(
          `\n✓ [${label}] completed — ${msg.usage.promptTokens + msg.usage.completionTokens} tokens`,
        );

        if (completedCount >= totalFlows) {
          printStatus();
          console.log("All strategies completed. Closing connection.");
          ws.close();
        }
        break;
      }

      case "strategy_error": {
        const t = findTracker(msg.runId);
        if (t) t.status = "error";
        completedCount++;

        const label = t?.label ?? msg.runId.slice(0, 8);
        console.error(
          `\n✗ [${label}] error: ${msg.error.code} — ${msg.error.message}`,
        );

        if (completedCount >= totalFlows) {
          printStatus();
          ws.close();
        }
        break;
      }

      case "strategy_list": {
        console.log(`\n[strategy_list] Active runs: ${msg.runs.length}`);
        for (const run of msg.runs) {
          console.log(
            `  ${run.runId.slice(0, 8)} — ${run.strategyName} (${run.status})`,
          );
        }
        break;
      }

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
