# @comma-agents/core — Examples

Runnable examples demonstrating the core APIs, ordered by progressive complexity.

## Prerequisites

1. Install dependencies from the workspace root:

   ```sh
   bun install
   ```

2. Install an AI SDK provider package (at least one):

   ```sh
   bun add @ai-sdk/openai            # for openai/* models
   bun add @ai-sdk/anthropic          # for anthropic/* models
   bun add @ai-sdk/openai-compatible  # for github-copilot/* models
   bun add ollama-ai-provider         # for ollama/* (local) models
   ```

3. Set the corresponding API key environment variable:

   ```sh
   export OPENAI_API_KEY=sk-...
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

## Running

From the project root:

```sh
MODEL=openai/gpt-4o bun run examples/core/scripts/01-basic-agent.ts
```

Change `MODEL` to any `providerID/modelID` string (e.g., `anthropic/claude-sonnet-4-5`, `github-copilot/gpt-4o`, `ollama/llama3`).

## How Model Resolution Works

`createAgent()` accepts a model string like `"openai/gpt-4o"` and resolves it internally via the global model registry and provider system:

1. **Direct model registry** — exact match via `registerModel()` (for tests/mocking)
2. **Provider resolution** — parses the string, resolves credentials from env vars or the credential store, then creates a `LanguageModel` via the provider system

No manual `LanguageModel` creation needed — just set your API key env var and pass the model string.

## Using GitHub Copilot

You can use GitHub Copilot as a provider if you have a Copilot subscription. Copilot exposes an OpenAI-compatible API at `api.githubcopilot.com` and supports models like `gpt-4o`, `claude-sonnet-4`, `gemini-2.5-flash`, and others.

### Setup

1. Install the OpenAI-compatible provider package:

   ```sh
   bun add @ai-sdk/openai-compatible
   ```

2. Set your GitHub token. The easiest way is via the GitHub CLI:

   ```sh
   export GITHUB_TOKEN=$(gh auth token)
   ```

   Alternatively, create a [personal access token](https://github.com/settings/tokens) on GitHub.

3. Run any example with the `github-copilot` provider:

   ```sh
    MODEL=github-copilot/gpt-4o bun run examples/core/scripts/01-basic-agent.ts
    MODEL=github-copilot/claude-sonnet-4 bun run examples/core/scripts/02-agent-with-tools.ts
   ```

### Available Copilot models

| Model string | Description |
|---|---|
| `github-copilot/gpt-4o` | OpenAI GPT-4o |
| `github-copilot/gpt-4o-mini` | OpenAI GPT-4o Mini |
| `github-copilot/gpt-4.1` | OpenAI GPT-4.1 |
| `github-copilot/claude-sonnet-4` | Anthropic Claude Sonnet 4 |
| `github-copilot/claude-haiku-4.5` | Anthropic Claude Haiku 4.5 |
| `github-copilot/gemini-2.5-flash` | Google Gemini 2.5 Flash |
| `github-copilot/gemini-2.5-pro` | Google Gemini 2.5 Pro |

> **Note:** Available models depend on your Copilot subscription tier and may change over time. Some models may consume premium requests.

## Examples

| # | File | Description |
|---|------|-------------|
| — | [`helpers.ts`](helpers.ts) | Shared helper: `getModelString()` reads the `MODEL` env var and returns the model string. |
| 01 | [`01-basic-agent.ts`](01-basic-agent.ts) | **Basic Agent** — create an agent with a model string, send a message, read the response and usage stats. Demonstrates `createAgent()`, `agent.call()`, conversation history, and `agent.reset()`. |
| 02 | [`02-agent-with-tools.ts`](02-agent-with-tools.ts) | **Agent with Built-in Tools** — equip an agent with the 6 built-in tools (`bash`, `read`, `write`, `edit`, `glob`, `grep`) by passing tool names as strings. The agent autonomously calls tools to answer questions about the filesystem. |
| 03 | [`03-custom-tool.ts`](03-custom-tool.ts) | **Custom Tool** — define your own tools with `defineTool()` and Zod parameter schemas, register them with `registerTool()`, then reference them by name alongside the built-in tools. |
| 04 | [`04-sequential-flow.ts`](04-sequential-flow.ts) | **Sequential Flow (Pipeline)** — chain three agents (writer → reviewer → editor) using `createSequentialFlow()`. Each agent's output feeds into the next. Demonstrates composable agent pipelines. |
| 05 | [`05-hooks.ts`](05-hooks.ts) | **Hooks (Lifecycle Callbacks)** — attach `AgentHooks` and `ToolHooks` to observe and transform agent behaviour. Shows logging, message transformation, and the difference between initial-call and regular hooks. |
| 06 | [`06-cycle-flow.ts`](06-cycle-flow.ts) | **Cycle Flow** — iterative agent loops with `createCycleFlow()`. A writer produces a poem, a reviewer critiques it, and the cycle repeats until approved or max iterations reached. |
| 07 | [`07-broadcast-flow.ts`](07-broadcast-flow.ts) | **Broadcast Flow** — parallel agent execution with `createBroadcastFlow()`. Three agents (historian, scientist, philosopher) answer the same question from different perspectives simultaneously. |
| 08 | [`08-nested-flows.ts`](08-nested-flows.ts) | **Nested Flows** — composing flows within flows. An inner sequential flow (writer → reviewer) is used as a step in an outer sequential flow, demonstrating hierarchical agent pipelines. |
| 09 | [`09-prompt-templates.ts`](09-prompt-templates.ts) | **Prompt Templates** — reusable parameterized prompts with `createPromptTemplate()`. Creates security and performance reviewer agents from the same template with different variables. |
| 10 | [`10-conversation-history.ts`](10-conversation-history.ts) | **Conversation History** — multi-turn dialogue showing how agents maintain context across calls, and how `agent.reset()` clears the history. |
| 11 | [`11-strategy-files.ts`](11-strategy-files.ts) | **Strategy Files** — loading strategies from JSON/YAML with `loadStrategyFromString()`. Models are resolved automatically via the global provider system. Demonstrates strategy export/roundtrip. |
| 12 | [`12-streaming.ts`](12-streaming.ts) | **Streaming** — real-time token streaming with `agent.stream()`. Shows text-only streaming and streaming with tool calls, handling each `AgentStreamEvent` type. |
| 13 | [`13-abort-cancellation.ts`](13-abort-cancellation.ts) | **Abort / Cancellation** — using `AbortController` to cancel agent execution. Covers timeout-based cancellation, flow cancellation, and pre-cancelled signals. |
| 14 | [`14-hook-into-agent.ts`](14-hook-into-agent.ts) | **hookIntoAgent** — attaching hooks to an agent after creation using `hookIntoAgent()` and `appendHook()`. Demonstrates logging and metrics plugins composed from separate hook objects. |

## Key APIs Used

- `createAgent(config)` — create an agent with a model string, system prompt, tools (by name), and hooks
- `registerTool(name, tool)` — register a custom tool in the global tool registry
- `registerModel(string, model)` — register a LanguageModel for direct resolution (tests/mocking)
- `registerProvider(id, registration)` — register a custom provider with the global resolver
- `defineTool({ description, parameters, execute })` — define a custom tool with a Zod schema
- `createSequentialFlow({ name, steps })` — chain agents into a pipeline flow
- `createCycleFlow({ name, steps, maxIterations, stopPhrase })` — iterative agent loop
- `createBroadcastFlow({ name, steps })` — parallel agent execution
- `createPromptTemplate({ template })` — parameterized prompt with LiquidJS `{{ variable }}` syntax, conditionals, loops, and filters
- `loadStrategy(path, options)` / `loadStrategyFromString(content, format, options)` — load strategy files
- `exportStrategy(strategy)` — serialize strategy back to JSON/YAML
- `parseModel(string)` — parse a `"provider/model"` string into provider metadata
- `AgentHooks` / `ToolHooks` / `FlowHooks` / `CycleHooks` — lifecycle hook interfaces for observation and transformation
