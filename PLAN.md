# CommaAgents v2 — Project Plan

## Overview

CommaAgents is a composable agent orchestration framework. Users define **agents**
(LLM-backed units of computation with tool access) and wire them together using
**flows** (execution patterns like pipelines, loops, and fan-out). Strategies are
declarative JSON files that describe entire agent workflows.

This is a TypeScript rewrite of the original Python
[CommaAgents](https://github.com/CloAI/CommaAgentsHub).

### Components

| Component  | Package                 | Description                                                                  |
| ---------- | ----------------------- | ---------------------------------------------------------------------------- |
| **Core**   | `@comma-agents/core`   | Agents, flows, hooks, tools, prompts, model registry, strategy (zero LLM deps) |
| **Daemon** | `@comma-agents/daemon` | Long-running process: executes flows, dynamic provider install, auth, WS API |
| **Debug**  | `@comma-agents/debug`  | Debug utilities: debugAgent(), debugFlow() for tracing and inspection        |
| **Utils**  | `@comma-agents/utils`  | Shared utilities: string, async, platform, process helpers                   |
| **TUI**    | `@comma-agents/tui`    | Terminal UI (Ink/React): setup wizard, model browser, connects via WebSocket  |

A **Web UI** may be added later. The WebSocket protocol is designed to support both
TUI and web clients without changes.

---

## Tech Stack

| Concern            | Choice                    | Rationale                                             |
| ------------------ | ------------------------- | ----------------------------------------------------- |
| Runtime            | Bun                       | Native TS, fast startup, built-in bundler/test        |
| Language           | TypeScript (strict)       | Type safety across all packages                       |
| Workspaces         | Bun workspaces            | Native monorepo support, no extra tooling             |
| LLM Interface      | Vercel AI SDK (`ai`)      | Unified provider interface, streaming, tool calling   |
| Provider Adapters  | `@ai-sdk/*` packages      | Pluggable — OpenAI, Anthropic, Google, Ollama, etc.   |
| TUI                | Ink (React for CLI)       | Component model, good DX, active ecosystem            |
| Daemon-Client comm | WebSocket                 | Real-time, bidirectional, reusable for Web UI         |
| Config / Strategy  | JSON (primary), YAML (opt)| JSON is native to JS; YAML supported as alternative   |
| Schema Validation  | Zod                       | Runtime validation, AI SDK tool schemas, strategy     |
| Testing            | `bun test`                | Built-in, Vitest-compatible API                       |
| Linting/Formatting | Biome                     | Fast all-in-one, minimal config                       |

---

## Coding Standards

### General

- **Strict TypeScript** — `strict: true`, no `any` unless absolutely necessary
  and explicitly annotated with a comment explaining why.
- **Explicit return types** on all exported functions and public methods.
- **Immutable by default** — prefer `const`, `readonly`, and `Readonly<T>`.
- **No classes unless necessary** — prefer plain functions, closures, and types.
  Use closure-based factory functions (e.g., `createAgent()`, `createUserAgent()`).
  Shared cross-cutting concerns (hooks) use higher-order functions, not inheritance.
- **No default exports** — always use named exports for better refactoring and
  auto-import support.
- **Barrel exports** — each package has a single `src/index.ts` that re-exports
  the public API. Internal modules are not directly importable by consumers.

### Naming Conventions

| Thing              | Convention          | Example                       |
| ------------------ | ------------------- | ----------------------------- |
| Files              | `kebab-case.ts`     | `base-agent.ts`               |
| Types / Interfaces | `PascalCase`        | `AgentConfig`, `FlowHooks`    |
| Functions / Vars   | `camelCase`         | `runFlow`, `modelRegistry`    |
| Constants          | `UPPER_SNAKE_CASE`  | `DEFAULT_TIMEOUT`             |
| Packages           | `@comma-agents/x`   | `@comma-agents/core`          |
| Directories        | `kebab-case`        | `built-in/`                   |

### Error Handling

- Define domain-specific error classes extending `Error` (e.g., `ModelResolutionError`,
  `FlowExecutionError`, `StrategyValidationError`).
- Never swallow errors silently — always log or re-throw.
- Use `Result<T, E>` pattern for expected failure paths (validation, parsing).
  Use exceptions for unexpected failures.

### Async Patterns

- All LLM calls and I/O are `async`.
- Streaming via AI SDK's `streamText()` which returns a `StreamTextResult`.
- Use `AbortController` / `AbortSignal` for cancellation — each `call()` and
  `stream()` invocation creates its own internal controller. Cancel via `.abort()`
  on the returned `AbortablePromise` or `AbortableAsyncGenerator`.
- Avoid fire-and-forget promises — always handle or propagate.

### Testing

- Test files live alongside source: `base-agent.test.ts` next to `base-agent.ts`.
- Unit tests for core logic, integration tests in a top-level `tests/` directory.
- Aim for high coverage on core package (agents, flows, hooks, tools).
- Use `bun test` — supports `describe`, `it`, `expect` out of the box.

### Dependencies

- Minimize external dependencies. Prefer Bun built-ins.
- Pin exact versions in `package.json` (no `^` or `~`).
- Key allowed dependencies:
  - `ai` — Vercel AI SDK core (streamText, generateText, tool calling)
  - `zod` — schema validation (used by AI SDK tools and strategy schemas)
  - `ink`, `react` — TUI only
  - `yaml` — optional, for YAML strategy support
  - No `ws` needed — Bun has native WebSocket support
  - Provider packages (`@ai-sdk/openai`, etc.) are NOT deps of core — they are
    dynamically installed by the daemon on first use

---

## Architecture

### Core Abstractions

```
┌──────────────────────────────────────────────────┐
│                   Strategy                        │
│  (JSON config -> Zod validated -> flow graph)     │
└──────────────────────┬───────────────────────────┘
                       │ builds
                       v
┌──────────────────────────────────────────────────┐
│                     Flow                          │
│  Sequential | Cycle | Broadcast                   │
│                                                   │
│  contains: Agent[] | Flow[]  (recursive)          │
└──────────────────────┬───────────────────────────┘
                       │ orchestrates
                       v
┌──────────────────────────────────────────────────┐
│               Agent (interface)                    │
│  name, call(msg), reset()                         │
│                                                   │
│  createAgent() — closure-based LLM agent factory  │
│  createUserAgent() — human-in-the-loop (closure)  │
│  hookIntoAgent() — append hooks post-creation     │
│                                                   │
│  Model: string (e.g. "openai/gpt-4o")            │
│  Tools: string[] resolved via global registry     │
│  Built-in: bash, read, write, edit, glob, grep   │
└──────────────────────┬───────────────────────────┘
                       │ resolves model string
                       v
┌──────────────────────────────────────────────────┐
│           Model Registry & AI SDK                  │
│                                                   │
│  "openai/gpt-4o" → resolveModel() → LanguageModel│
│  Global provider registry (registerProvider)       │
│  Global model registry (registerModel)             │
│                                                   │
│  LanguageModel    ← @ai-sdk/openai               │
│                  ← @ai-sdk/anthropic             │
│                  ← @ai-sdk/google                │
│                  ← ollama-ai-provider            │
│                  ← any AI SDK provider            │
└──────────────────────────────────────────────────┘
```

### Agent Architecture (Functional / Closure-Based)

Agents use the Vercel AI SDK internally. Model and tool resolution are handled by
global registries — consumers pass strings, not SDK objects.

The architecture is **purely functional** — no classes:

- **`Agent` interface** — the polymorphic contract. Flows operate on this type exclusively.
- **`createAgent()`** — closure-based factory. Accepts `AgentConfig` with a model string
  and optional tool name strings. Internally resolves the model via `resolveModel()` and
  tools via the tool registry. Manages conversation history, streaming, and hooks via closures.
- **`createUserAgent()`** — closure-based factory for human-in-the-loop agents. Returns `Agent`.
- **`hookIntoAgent()`** — appends hooks to an existing agent post-creation.

No classes, no inheritance hierarchy. Hook lifecycle is a functional pipeline applied
inside `createAgent`.

```typescript
// The core contract — all flows use this
interface Agent {
  readonly name: string;
  call(message: string): AbortablePromise<AgentCallResult>;
  stream(message: string): AbortableAsyncGenerator<AgentStreamEvent>;
  reset(): void;
}

// LLM-backed agent config — model and tools are strings
interface AgentConfig {
  readonly name: string;
  readonly model: string;                // e.g. "openai/gpt-4o"
  readonly systemPrompt?: string | PromptTemplate; // static string or dynamic template
  readonly tools?: string[];             // e.g. ["bash", "read"] — resolved via registry
}

// Human-in-the-loop agent — collects input or returns preset message
interface UserAgentConfig {
  readonly name: string;
  readonly requireInput?: boolean;       // default: true
  readonly presetMessage?: string;
  readonly inputCollector?: InputCollector;
}

// InputCollector receives rich context for daemon/TUI integration
interface InputRequest {
  readonly agentName: string;
  readonly prompt: string;
  readonly signal?: AbortSignal;
}
type InputCollector = (request: InputRequest) => Promise<string>;
```

### Tool System

Tools are first-class citizens. Agents reference tools by **string name** (e.g., `["bash", "read"]`).
Tools are resolved at agent creation time via a layered resolution pipeline:

1. **Built-in tools** — `bash`, `read`, `write`, `edit`, `glob`, `grep` (always available)
2. **Global tool registry** — `registerTool(name, tool)` / `unregisterTool(name)`
3. **Custom tools** — passed directly to `createAgent` via `customTools` (for programmatic use)

Tools use Zod schemas for parameter validation, matching the AI SDK's `tool()` helper.

```typescript
// Tool registry API
function registerTool(name: string, tool: ToolDef): void;
function unregisterTool(name: string): void;
function resetToolRegistry(): void;
function getRegisteredToolNames(): readonly string[];

// Tool definition
interface ToolDef<TParams extends z.ZodType = z.ZodType> {
  readonly description: string;
  readonly parameters: TParams;
  execute(args: z.infer<TParams>, ctx: ToolContext): Promise<ToolResult>;
}

interface ToolResult {
  readonly output: string;
  readonly metadata?: Record<string, unknown>;
}

interface ToolContext {
  readonly agentName: string;
  readonly flowName?: string;
  readonly abort: AbortSignal;
}
```

### Hook System

Both agents and flows support hooks at defined lifecycle points.
Agent hooks are applied via the `withAgentHooks()` middleware (higher-order function),
so the lifecycle is implemented once and shared by all agent types.

**Agent hooks:**
`alterCallMessage -> beforeCall -> [LLM call] -> afterCall -> alterResponse`
(plus `initial*` variants for the first call, with fallback to base hooks)

**Tool hooks (new):**
`beforeToolCall(name, args) -> [tool execution] -> afterToolCall(name, args, result)`

**Flow hooks:**
`alterMessageBeforeFlow -> beforeFlow -> [execute] -> afterFlow -> alterMessageAfterFlow`

Hooks are arrays of functions, executed in order. `alter*` hooks transform
values (chain output to input); `before*/after*` hooks are side-effects.

### Model Registry & Auth

Agents reference models by string (e.g., `"openai/gpt-4o"`). The framework resolves
the string to an AI SDK `LanguageModel` instance. **No API keys appear in strategy
files.**

**Model string format:** `providerID/modelID` (e.g., `"anthropic/claude-sonnet-4-5"`)

**Known providers map** (metadata only, in core):
```typescript
const KNOWN_PROVIDERS: Record<string, string> = {
  openai: "@ai-sdk/openai",
  anthropic: "@ai-sdk/anthropic",
  google: "@ai-sdk/google",
  "google-vertex": "@ai-sdk/google-vertex",
  ollama: "ollama-ai-provider",
  groq: "@ai-sdk/groq",
  mistral: "@ai-sdk/mistral",
  xai: "@ai-sdk/xai",
  bedrock: "@ai-sdk/amazon-bedrock",
  azure: "@ai-sdk/azure",
  // extensible via config
};
```

**API key resolution** (layered, in order of precedence):

1. **Environment variables** — standard names: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.
2. **Credential store** — `~/.local/share/comma-agents/auth.json` (file permissions `0o600`)
3. **Config interpolation** — `{env:VAR_NAME}` and `{file:/path/to/key}` in config files

**Credential store schema:**
```typescript
// ~/.local/share/comma-agents/auth.json
{
  "openai": { "key": "sk-..." },
  "anthropic": { "key": "sk-ant-..." }
}
```

**Dynamic provider installation** (daemon only):

When a model is requested and the provider's npm package is not installed, the daemon
runs `bun add <package>` into a cache directory, then dynamically `import()`s it.
This means users never need to manually install provider packages.

```
"anthropic/claude-sonnet-4-5"
  → parse: providerID = "anthropic", modelID = "claude-sonnet-4-5"
  → resolve key: check env ANTHROPIC_API_KEY → credential store → config
  → resolve package: KNOWN_PROVIDERS["anthropic"] = "@ai-sdk/anthropic"
  → is installed? → no → bun add @ai-sdk/anthropic (into cache dir)
  → dynamic import → createAnthropic({ apiKey }) → model instance
```

### WebSocket Protocol

Client (TUI / Web) and Daemon communicate via typed JSON messages:

**Client -> Daemon:**
- `start_flow` — start a strategy/flow by name or file
- `stop_flow` — cancel a running flow
- `user_input` — respond to a `request_input` prompt
- `list_flows` — list available and running flows
- `subscribe` — subscribe to events from a specific flow

**Daemon -> Client:**
- `flow_started` — flow execution began, includes flow tree structure
- `flow_completed` — flow finished, includes final result
- `agent_output` — an agent produced output
- `agent_streaming` — streaming token from an agent
- `request_input` — a UserAgent is waiting for human input
- `request_auth` — a provider needs authentication (TUI shows key prompt)
- `flow_error` — an error occurred during execution
- `state_update` — full daemon state snapshot

### Strategy Schema (JSON-first)

Strategies are JSON files (with optional YAML support). They reference models by
string — no API keys, no provider configuration.

```json
{
  "name": "Code Review Pipeline",
  "version": "1.0",
  "description": "A multi-agent code review workflow",
  "agents": {
    "user-input": {
      "type": "user",
      "config": {
        "requireInput": true
      }
    },
    "writer": {
      "model": "openai/gpt-4o",
      "systemPrompt": "You are a code writer."
    },
    "reviewer": {
      "model": "anthropic/claude-sonnet-4-5",
      "systemPrompt": "You are a code reviewer."
    }
  },
  "flow": {
    "name": "Review Pipeline",
    "type": "sequential",
    "steps": [
      { "agent": "user-input" },
      { "agent": "writer" },
      {
        "name": "Review Loop",
        "type": "cycle",
        "cycles": 3,
        "steps": [
          { "agent": "reviewer" }
        ]
      }
    ]
  }
}
```

Key differences from the Python version:
- Top-level `agents` registry — agents defined once, referenced by name in flow steps
- Single entry `flow` (not an array of flows) — a tree of sequential/cycle/broadcast
- Simple type identifiers (`sequential`, `cycle`, `broadcast`) not class paths
- Models referenced by `providerID/modelID` string — no provider config section
- No API keys in strategy files — resolved at runtime via env/store/config
- JSON primary format (native JS), YAML as optional alternative
- `{env:VAR}` and `{file:PATH}` interpolation in config files (not strategies)
- Validated with Zod schemas producing clear error messages

---

## Directory Structure

```
CommaAgents2/
├── package.json              # Root: workspaces, scripts
├── bunfig.toml               # Bun config
├── tsconfig.json             # Base tsconfig (shared)
├── biome.json                # Linting / formatting
├── PLAN.md                   # This file
├── docs/                     # Fumadocs-powered docs site (Next.js)
├── examples/
│   ├── core/                 # Core library examples
│   │   ├── scripts/          # 14 runnable example scripts
│   │   └── strategies/       # Strategy file examples (JSON)
│   └── daemon/               # Daemon usage examples
├── end-to-end-tests/         # E2E tests (Bun)
├── packages/
│   ├── core/                 # @comma-agents/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── agents/
│   │       │   ├── index.ts
│   │       │   ├── agent/
│   │       │   │   ├── agent.ts           # createAgent() factory (closure-based)
│   │       │   │   ├── agent.types.ts     # Agent, AgentConfig, AgentCallResult
│   │       │   │   ├── agent.utils.ts     # buildAgentToolSet, etc.
│   │       │   │   └── agent.constants.ts
│   │       │   ├── built-in/
│   │       │   │   └── user/
│   │       │   │       ├── user-agent.ts       # createUserAgent()
│   │       │   │       ├── user-agent.types.ts # UserAgentConfig, InputCollector
│   │       │   │       └── user-agent.utils.ts
│   │       │   ├── hook-into-agent/
│   │       │   │   └── hook-into-agent.ts # hookIntoAgent()
│   │       │   ├── hooks/
│   │       │   │   ├── index.ts
│   │       │   │   ├── hooks.ts           # Hook runners (runSideEffectHooks, etc.)
│   │       │   │   └── hooks.types.ts     # AgentHooks, ToolHooks
│   │       │   └── loader/
│   │       │       ├── index.ts
│   │       │       ├── loader.ts          # loadAgentFromDescription()
│   │       │       ├── loader.types.ts    # AgentDescription
│   │       │       └── loader.schema.ts   # Agent description Zod schema
│   │       ├── credentials/
│   │       │   ├── index.ts
│   │       │   ├── credentials.ts         # createCredentialStore()
│   │       │   ├── credentials.types.ts   # CredentialStore, Credential
│   │       │   └── backends/
│   │       │       └── json-file.ts       # JSON file credential backend
│   │       ├── defaults/
│   │       │   ├── index.ts
│   │       │   ├── defaults.ts            # Global defaults: setGlobalCredentialStore(),
│   │       │   │                          #   registerProvider(), getGlobalProviderResolver()
│   │       │   └── defaults.types.ts      # GlobalDefaults
│   │       ├── errors/
│   │       │   └── index.ts               # Domain error classes
│   │       ├── flows/
│   │       │   ├── index.ts
│   │       │   ├── flow/
│   │       │   │   ├── flow.ts            # createFlow(), buildFlowAgent()
│   │       │   │   ├── flow.types.ts      # FlowResult, FlowConfig
│   │       │   │   └── flow.utils.ts
│   │       │   ├── built-in/
│   │       │   │   ├── sequential/
│   │       │   │   │   └── sequential-flow.ts # createSequentialFlow()
│   │       │   │   ├── cycle/
│   │       │   │   │   └── cycle-flow.ts      # createCycleFlow()
│   │       │   │   └── broadcast/
│   │       │   │       └── broadcast-flow.ts  # createBroadcastFlow()
│   │       │   └── hook-into-flow/
│   │       │       └── hook-into-flow.ts      # hookIntoFlow()
│   │       ├── hooks/
│   │       │   ├── index.ts               # Hook types re-export
│   │       │   └── built-in/
│   │       │       └── token-tracking/    # Token usage tracking hooks
│   │       ├── model/
│   │       │   ├── index.ts
│   │       │   ├── model.ts               # resolveModel(), registerModel(), model registry
│   │       │   ├── model.types.ts         # ParsedModel, ProviderFactory, ProviderResolver
│   │       │   ├── model.utils.ts         # parseModel()
│   │       │   └── model.constants.ts     # KNOWN_PROVIDERS map
│   │       ├── prompts/
│   │       │   ├── types.ts               # ChatMessage, ResponseMessage
│   │       │   ├── message-builder.ts     # buildMessages(), resolveSystemPrompt()
│   │       │   ├── history/
│   │       │   │   └── conversation-history.ts # createConversationHistory()
│   │       │   └── template/
│   │       │       └── prompt-template.ts     # createPromptTemplate()
│   │       ├── strategy/
│   │       │   ├── index.ts
│   │       │   ├── schema.ts              # Zod strategy schema (StrategySchema)
│   │       │   ├── loader/
│   │       │   │   ├── loader.ts          # loadStrategy(), loadStrategyFromString()
│   │       │   │   ├── loader.types.ts    # LoadStrategyOptions
│   │       │   │   └── loader.utils.ts    # Strategy parsing utilities
│   │       │   └── exporter/
│   │       │       ├── exporter.ts        # exportStrategy() (JSON/YAML)
│   │       │       └── exporter.types.ts
│   │       └── tools/
│   │           ├── index.ts
│   │           ├── tool.registry.ts       # registerTool(), unregisterTool(), resolveTools()
│   │           ├── tool.types.ts          # ToolDef, ToolResult, ToolContext
│   │           ├── tool.constants.ts      # BUILT_IN_TOOL_NAMES
│   │           ├── define/
│   │           │   └── define-tool.ts     # defineTool() helper
│   │           └── built-in/
│   │               ├── index.ts           # createDefaultTools()
│   │               ├── bash/bash.ts       # createBashTool()
│   │               ├── read/read.ts       # createReadTool()
│   │               ├── write/write.ts     # createWriteTool()
│   │               ├── edit/edit.ts       # createEditTool()
│   │               ├── glob/glob.ts       # createGlobTool()
│   │               └── grep/grep.ts       # createGrepTool()
│   ├── daemon/               # @comma-agents/daemon
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── cli.ts                 # CLI entry point
│   │       ├── pid.ts                 # PID file management
│   │       ├── config/                # Daemon configuration
│   │       ├── executor/              # Flow executor, event sink, input bridge
│   │       ├── logger/                # Logger with file/stderr/system sinks
│   │       ├── server/
│   │       │   ├── server.ts          # WebSocket server
│   │       │   └── protocol/          # Typed message schemas (requests + responses)
│   │       └── state/                 # Daemon state management
│   ├── debug/                # @comma-agents/debug
│   │   └── src/
│   │       ├── index.ts
│   │       └── debug.ts               # debugAgent(), debugFlow()
│   ├── utils/                # @comma-agents/utils
│   │   └── src/                       # Shared utilities (string, async, platform, etc.)
│   └── tui/                  # @comma-agents/tui (placeholder)
│       └── src/
│           └── index.tsx              # Ink-based terminal UI (minimal)
```

---

## Implementation Phases

| #  | Phase                            | Scope                                                                    | Status |
| -- | -------------------------------- | ------------------------------------------------------------------------ | ------ |
| 1  | **Scaffolding**                  | Monorepo, configs, empty packages, verify `bun install`                  | ✅     |
| 2  | **Core: Agents, Hooks & Tools**  | Agent interface, createAgent (closure-based), createUserAgent, hook system, tool types, AI SDK integration | ✅     |
| 3  | **Core: Model Registry & Auth**  | Model string parsing, KNOWN_PROVIDERS map, key resolution (env → store → config), credential store | ✅     |
| 4  | **Core: Flows**                  | Sequential, Cycle, Broadcast                                             | ✅     |
| 5  | **Core: Prompts**                | Message building, system prompts, conversation history management        | ✅     |
| 6  | **Core: Built-in Tools**         | Standard tool set — bash, read, write, edit, glob, grep, tool registry   | ✅     |
| 7  | **Core: Strategy**               | JSON loader (primary), Zod schema, env/file interpolation, YAML (optional) | ✅     |
| 8  | **Daemon**                       | WebSocket server, flow executor, dynamic provider install, state mgmt    | ✅     |
| 9  | **TUI**                          | Ink app, WS client, dashboard, setup wizard, model browser               |        |
| 10 | **Hub & Plugins**                | Plugin loading system, hub integration (deferred from v1)                |        |
| 11 | **Testing & Polish**             | Tests, CLI entry points, error handling, docs                            |        |
