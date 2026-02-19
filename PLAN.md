# CommaAgents v2 — Project Plan

## Overview

CommaAgents is a composable agent orchestration framework. Users define **agents**
(LLM-backed units of computation) and wire them together using **flows** (execution
patterns like pipelines, loops, and fan-out). Strategies are declarative YAML files
that describe entire agent workflows.

This is a TypeScript rewrite of the original Python
[CommaAgents](https://github.com/CloAI/CommaAgentsHub).

### Components

| Component  | Package                 | Description                                                      |
| ---------- | ----------------------- | ---------------------------------------------------------------- |
| **Core**   | `@comma-agents/core`   | Agents, flows, hooks, prompts, providers, code interpreter, YAML |
| **Daemon** | `@comma-agents/daemon` | Long-running process that executes flows, exposes WebSocket API  |
| **TUI**    | `@comma-agents/tui`    | Terminal UI (Ink/React) connecting to the daemon via WebSocket    |

A **Web UI** may be added later. The WebSocket protocol is designed to support both
TUI and web clients without changes.

---

## Tech Stack

| Concern            | Choice              | Rationale                                         |
| ------------------ | ------------------- | ------------------------------------------------- |
| Runtime            | Bun                 | Native TS, fast startup, built-in bundler/test    |
| Language           | TypeScript (strict) | Type safety across all packages                   |
| Workspaces         | Bun workspaces      | Native monorepo support, no extra tooling         |
| TUI                | Ink (React for CLI) | Component model, good DX, active ecosystem        |
| Daemon-Client comm | WebSocket           | Real-time, bidirectional, reusable for Web UI     |
| Config             | YAML (redesigned)   | Human-readable, validated with Zod                |
| Testing            | `bun test`          | Built-in, Vitest-compatible API                   |
| Linting/Formatting | Biome               | Fast all-in-one, minimal config                   |

---

## Coding Standards

### General

- **Strict TypeScript** — `strict: true`, no `any` unless absolutely necessary
  and explicitly annotated with a comment explaining why.
- **Explicit return types** on all exported functions and public methods.
- **Immutable by default** — prefer `const`, `readonly`, and `Readonly<T>`.
- **No classes unless necessary** — prefer plain functions and types for stateless
  logic. Use classes for stateful objects (agents, flows, providers) where the
  OOP model is a natural fit.
- **No default exports** — always use named exports for better refactoring and
  auto-import support.
- **Barrel exports** — each package has a single `src/index.ts` that re-exports
  the public API. Internal modules are not directly importable by consumers.

### Naming Conventions

| Thing              | Convention          | Example                       |
| ------------------ | ------------------- | ----------------------------- |
| Files              | `kebab-case.ts`     | `base-agent.ts`               |
| Types / Interfaces | `PascalCase`        | `AgentConfig`, `FlowHooks`    |
| Functions / Vars   | `camelCase`         | `runFlow`, `providerRegistry` |
| Constants          | `UPPER_SNAKE_CASE`  | `DEFAULT_TIMEOUT`             |
| Packages           | `@comma-agents/x`   | `@comma-agents/core`          |
| Directories        | `kebab-case`        | `code-interpreter/`           |

### Error Handling

- Define domain-specific error classes extending `Error` (e.g., `ProviderError`,
  `FlowExecutionError`, `StrategyValidationError`).
- Never swallow errors silently — always log or re-throw.
- Use `Result<T, E>` pattern for expected failure paths (validation, parsing).
  Use exceptions for unexpected failures.

### Async Patterns

- All LLM calls and I/O are `async`.
- Use `AsyncGenerator<string>` for streaming.
- Use `AbortController` / `AbortSignal` for cancellation.
- Avoid fire-and-forget promises — always handle or propagate.

### Testing

- Test files live alongside source: `base-agent.test.ts` next to `base-agent.ts`.
- Unit tests for core logic, integration tests in a top-level `tests/` directory.
- Aim for high coverage on core package (agents, flows, hooks).
- Use `bun test` — supports `describe`, `it`, `expect` out of the box.

### Dependencies

- Minimize external dependencies. Prefer Bun built-ins.
- Pin exact versions in `package.json` (no `^` or `~`).
- Key allowed dependencies:
  - `ink`, `react` — TUI only
  - `zod` — schema validation
  - `yaml` — YAML parsing
  - No `ws` needed — Bun has native WebSocket support

---

## Architecture

### Core Abstractions

```
┌─────────────────────────────────────────────────┐
│                   Strategy                       │
│  (YAML config -> validated -> instantiated graph)│
└───────────────────────┬─────────────────────────┘
                        │ builds
                        v
┌─────────────────────────────────────────────────┐
│                     Flow                         │
│  Sequential | Cycle | InfiniteCycle | Broadcast   │
│                                                  │
│  contains: Agent[] | Flow[]  (recursive)         │
└───────────────────────┬─────────────────────────┘
                        │ orchestrates
                        v
┌─────────────────────────────────────────────────┐
│                    Agent                         │
│  name, hooks, promptTemplate, provider           │
│                                                  │
│  call(message) -> prompt -> provider -> response  │
│                                                  │
│  Optional: codeInterpreter, cache               │
└───────────────────────┬─────────────────────────┘
                        │ delegates to
                        v
┌─────────────────────────────────────────────────┐
│                  Provider                        │
│  OpenAI | Ollama | Custom (plugin)              │
│                                                  │
│  call(prompt) -> string                          │
│  stream(prompt) -> AsyncGenerator<string>        │
└─────────────────────────────────────────────────┘
```

### Hook System

Both agents and flows support hooks at defined lifecycle points:

**Agent hooks:**
`alterCallMessage -> beforeCall -> [LLM call] -> afterCall -> alterResponse`
(plus `initial*` variants for the first call)

**Flow hooks:**
`alterMessageBeforeFlow -> beforeFlow -> [execute] -> afterFlow -> alterMessageAfterFlow`

Hooks are arrays of functions, executed in order. `alter*` hooks transform
values (chain output to input); `before*/after*` hooks are side-effects.

### Provider Plugin System

```typescript
interface LLMProvider {
  readonly name: string;
  call(prompt: string, options?: CallOptions): Promise<string>;
  stream?(prompt: string, options?: CallOptions): AsyncGenerator<string>;
  dispose?(): Promise<void>;
}
```

Providers are registered in a `ProviderRegistry` and referenced by name in agent
configs and YAML strategies. This registry pattern allows future hub/plugin support
without changing core code.

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
- `flow_error` — an error occurred during execution
- `state_update` — full daemon state snapshot

### YAML Strategy Schema (Redesigned)

```yaml
name: "Example Strategy"
version: "1.0"
description: "A code review pipeline"

providers:
  - name: gpt4
    type: openai
    config:
      model: gpt-4o
      apiKey: ${OPENAI_API_KEY}

flows:
  - name: "Review Pipeline"
    type: sequential
    steps:
      - name: "User Input"
        type: agent
        agent:
          type: user
          config:
            requireInput: true

      - name: "Writer"
        type: agent
        agent:
          provider: gpt4
          systemPrompt: "You are a code writer."

      - name: "Review Loop"
        type: cycle
        cycles: 3
        steps:
          - name: "Reviewer"
            type: agent
            agent:
              provider: gpt4
              systemPrompt: "You are a code reviewer."
```

Key differences from the Python version:
- Simple type identifiers (`sequential`, `cycle`, `broadcast`) not class paths
- Top-level `providers` section, referenced by name
- `${VAR}` environment variable interpolation
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
├── packages/
│   ├── core/                 # @comma-agents/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── agents/
│   │       ├── flows/
│   │       ├── providers/
│   │       ├── prompts/
│   │       ├── code-interpreter/
│   │       ├── strategy/
│   │       ├── hooks/
│   │       └── cache/
│   ├── daemon/               # @comma-agents/daemon
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── server.ts
│   │       ├── executor/
│   │       ├── protocol/
│   │       ├── state/
│   │       └── config/
│   └── tui/                  # @comma-agents/tui
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.tsx
│           ├── app.tsx
│           ├── client/
│           ├── components/
│           ├── hooks/
│           └── screens/
```

---

## Implementation Phases

| #  | Phase                         | Scope                                                        |
| -- | ----------------------------- | ------------------------------------------------------------ |
| 1  | **Scaffolding**               | Monorepo, configs, empty packages, verify `bun install`      |
| 2  | **Core: Agents & Hooks**      | `BaseAgent`, `UserAgent`, hook system, types                 |
| 3  | **Core: Flows**               | Sequential, Cycle, InfiniteCycle, CycleObserver, Broadcast   |
| 4  | **Core: Prompts & Providers** | PromptTemplate, provider interface, registry                 |
| 5  | **Core: Code Interpreter**    | Code block extraction, language handlers (TS, Python, Shell) |
| 6  | **Core: Strategy**            | YAML loader, Zod schema, exporter, env var interpolation     |
| 7  | **Daemon**                    | WebSocket server, flow executor, job queue, state management |
| 8  | **TUI**                       | Ink app, WS client, dashboard, flow tree, log viewer         |
| 9  | **Built-in Providers**        | OpenAI, Ollama provider implementations                      |
| 10 | **Testing & Polish**          | Tests, CLI entry points, error handling, docs                |
