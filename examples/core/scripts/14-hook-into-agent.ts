/**
 * 14 — hookIntoAgent (Post-Creation Hook Injection)
 *
 * Demonstrates attaching hooks to an agent AFTER creation using
 * `hookIntoAgent` and the lower-level `appendHook` method.
 *
 * This approach is useful when:
 *   - You want to compose hooks from separate modules / plugins
 *   - You need to conditionally add hooks based on runtime configuration
 *   - You're building middleware that decorates agents it doesn't own
 *
 * This example shows:
 *   - hookIntoAgent(agent, hooks) — bulk-append hooks from an AgentHooks object
 *   - appendHook(hookName, callback) — append a single hook callback
 *   - Multiple hookIntoAgent calls stack hooks
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/14-hook-into-agent.ts
 *
 * Concepts:
 *   - Post-creation hook injection with hookIntoAgent
 *   - hookIntoAgent for bulk hook attachment
 *   - appendHook for single hook attachment
 *   - Hook stacking — multiple callbacks on the same hook point
 */

import type { AgentHooks } from "@comma-agents/core";
import { createAgent, hookIntoAgent } from "@comma-agents/core";
import { getModelString } from "./helpers";

// ---------------------------------------------------------------------------
// Logging plugin — a reusable set of hooks
// ---------------------------------------------------------------------------

/** A reusable hooks object that logs call lifecycle events. */
const loggingHooks: AgentHooks = {
  beforeCall: [
    async (message) => {
      console.log(`  [log] beforeCall — "${message.slice(0, 60)}..."`);
    },
  ],
  afterCallResult: [
    async (result) => {
      console.log(`  [log] afterCallResult — ${result.text.length} chars`);
    },
  ],
};

// ---------------------------------------------------------------------------
// Metrics plugin — another reusable set of hooks
// ---------------------------------------------------------------------------

/** Tracks call timing as a side-effect hook. */
const metricsHooks: AgentHooks = {
  beforeCall: [
    async () => {
      console.time("  [metrics] call duration");
    },
  ],
  afterCallResult: [
    async () => {
      console.timeEnd("  [metrics] call duration");
    },
  ],
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const model = getModelString();

  // -------------------------------------------------------------------------
  // 1. Create a plain agent, then attach an alterResponse hook
  // -------------------------------------------------------------------------

  console.log(
    "\n=== Step 1: Create agent and attach an alterResponse hook ===\n",
  );

  const agent = createAgent({
    name: "demo-agent",
    model,
    systemPrompt: "You are a concise assistant. Reply in one sentence.",
  });

  hookIntoAgent(agent, {
    alterResponse: [
      async (text) => {
        console.log("  [initial hook] alterResponse — trimming whitespace");
        return text.trim();
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 2. Use hookIntoAgent to attach the logging plugin
  // -------------------------------------------------------------------------

  console.log("=== Step 2: Attach logging hooks via hookIntoAgent ===\n");

  hookIntoAgent(agent, loggingHooks);
  console.log("  Logging hooks attached.\n");

  // -------------------------------------------------------------------------
  // 3. Attach metrics hooks
  // -------------------------------------------------------------------------

  console.log("=== Step 3: Attach metrics hooks ===\n");

  hookIntoAgent(agent, metricsHooks);
  console.log("  Metrics hooks attached.\n");

  // -------------------------------------------------------------------------
  // 4. Use appendHook directly for a one-off hook
  // -------------------------------------------------------------------------

  console.log("=== Step 4: Append a single hook via appendHook ===\n");

  // appendHook is on the concrete object (not the Agent interface)
  // so we cast to access it. hookIntoAgent uses it internally.
  (agent as any).appendHook("alterResponse", async (text: string) => {
    console.log("  [appendHook] alterResponse — appending signature");
    return `${text}\n— demo-agent`;
  });

  console.log("  Single alterResponse hook appended.\n");

  // -------------------------------------------------------------------------
  // 5. Make a call — all hooks fire in order
  // -------------------------------------------------------------------------

  console.log("=== Step 5: Call the agent (all hooks fire) ===\n");

  const result = await agent.call("What is the capital of France?");

  console.log(`\n--- Final response ---`);
  console.log(result.text);

  // -------------------------------------------------------------------------
  // 6. Second call — hooks fire again, demonstrating persistence
  // -------------------------------------------------------------------------

  console.log("\n=== Step 6: Second call (hooks persist across calls) ===\n");

  const result2 = await agent.call("And what about Germany?");

  console.log(`\n--- Final response ---`);
  console.log(result2.text);
}

main().catch(console.error);
