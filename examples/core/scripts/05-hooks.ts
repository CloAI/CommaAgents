/**
 * 05 — Hooks (Lifecycle Callbacks)
 *
 * Demonstrates the hooks system for observing and transforming agent
 * behaviour at different lifecycle points.
 *
 * This example shows:
 *   - AgentHooks: beforeCall, afterCall, alterCallMessage, alterResponse
 *   - ToolHooks: beforeToolCall, afterToolCall
 *   - Initial-call variants (alterInitialCallMessage)
 *   - Using hooks for logging, metrics, and message transformation
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/05-hooks.ts
 *
 * Concepts:
 *   - SideEffectHook<T>  — observe a value without changing it (logging, metrics)
 *   - TransformHook<T>   — observe AND modify a value (message rewriting)
 *   - Hooks are arrays — multiple hooks run in order (transforms chain)
 *   - Initial-call hooks run only on the first call; base hooks run on subsequent calls
 */

import type { AgentHooks, ToolHooks } from "@comma-agents/core";
import { createAgent, defineTool, hookIntoAgent, registerTool } from "@comma-agents/core";
import { z } from "zod";
import { getModelString } from "./helpers";

// ---------------------------------------------------------------------------
// A simple tool for the agent to use (so we can demo tool hooks)
// ---------------------------------------------------------------------------

const timeTool = defineTool({
  description: "Get the current date and time.",
  parameters: z.object({}),
  execute: async () => ({
    output: new Date().toISOString(),
  }),
});

// Register the custom tool so it can be referenced by name
registerTool("time", timeTool);

// ---------------------------------------------------------------------------
// Define hooks
// ---------------------------------------------------------------------------

/**
 * Agent hooks — observe and transform the agent lifecycle.
 *
 * Execution order per call:
 *   alterCallMessage → beforeCall → [LLM call] → afterCall → alterResponse
 *
 * On the very first call, the `alter*Initial*` / `before/afterInitial*`
 * variants are used (falling back to the base hooks if not set).
 */
const agentHooks: AgentHooks = {
  // --- Transform hooks (can modify the value) ---

  // Runs only on the FIRST call. Adds a prefix to the initial user message.
  alterInitialCallMessage: [
    async (message) => {
      console.log("[hook] alterInitialCallMessage — adding greeting prefix");
      return `[First message] ${message}`;
    },
  ],

  // Runs on EVERY call (except the first, if alterInitialCallMessage is set).
  // Could be used for prompt injection, guardrails, input sanitisation, etc.
  alterCallMessage: [
    async (message) => {
      console.log(`[hook] alterCallMessage — input length: ${message.length}`);
      return message; // pass through unchanged
    },
  ],

  // Transform the final response text before it's returned to the caller.
  alterResponse: [
    async (response) => {
      console.log(`[hook] alterResponse — output length: ${response.length}`);
      // Example: strip any trailing whitespace
      return response.trim();
    },
  ],

  // --- Side-effect hooks (observe only, return void) ---

  beforeCall: [
    async (message) => {
      console.log(`[hook] beforeCall — sending: "${message.slice(0, 50)}..."`);
    },
  ],

  afterCall: [
    async (response) => {
      console.log(`[hook] afterCall — received: "${response.slice(0, 50)}..."`);
    },
  ],
};

/**
 * Tool hooks — observe tool invocations within an agent call.
 * Useful for logging, auditing, rate limiting, etc.
 */
const toolHooks: ToolHooks = {
  beforeToolCall: [
    async ({ name, args }) => {
      console.log(`[hook] beforeToolCall — tool: ${name}, args: ${args}`);
    },
  ],

  afterToolCall: [
    async ({ name, result }) => {
      console.log(`[hook] afterToolCall — tool: ${name}, result: ${result.slice(0, 60)}`);
    },
  ],
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const model = getModelString();

  const agent = createAgent({
    name: "hooked-agent",
    model,
    systemPrompt:
      "You are a helpful assistant. Use the time tool when asked about the current time.",
    tools: ["time"],
  });

  // Attach hooks post-creation via hookIntoAgent
  hookIntoAgent(agent, { ...agentHooks, ...toolHooks });

  // First call — triggers alterInitialCallMessage
  console.log("\n=== First call (initial hooks) ===\n");
  const first = await agent.call("What time is it right now?");
  console.log(`\nResponse: ${first.text}`);

  // Second call — triggers alterCallMessage (not the initial variant)
  console.log("\n=== Second call (regular hooks) ===\n");
  const second = await agent.call("Thanks! What day of the week is it?");
  console.log(`\nResponse: ${second.text}`);
}

main().catch(console.error);
