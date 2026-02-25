# Examples

Example scripts and strategies for CommaAgents v2. This is a private workspace package (`@comma-agents/examples`) that is not published — it exists only in source for development and demonstration purposes.

## Structure

| Directory | Package | Description |
| --------- | ------- | ----------- |
| [core/strategies/](./core/strategies/) | `@comma-agents/core` | Strategy files (JSON/YAML) showcasing agents, flows, hooks, and tools |
| [core/scripts/](./core/scripts/) | `@comma-agents/core` | Runnable TypeScript examples for all core APIs (agents, flows, tools, streaming, etc.) |
| [daemon/scripts/](./daemon/scripts/) | `@comma-agents/daemon` | WebSocket client examples for the daemon (basic, streaming, interactive, multi-flow) |

More categories (e.g. `tui/`) will be added as those packages mature.

## Running Strategy Examples

Strategy examples can be run from the project root via a single `example` script:

```sh
bun run example <alias>
```

List all available strategy examples:

```sh
bun run example --list
```

## Running Script Examples

Core script examples are run from the project root:

```sh
MODEL=openai/gpt-4o bun run examples/core/scripts/01-basic-agent.ts
```

Daemon script examples require a running daemon instance:

```sh
# Terminal 1: start the daemon
bun run daemon

# Terminal 2: run a daemon example
bun run examples/daemon/scripts/01-basic-client.ts
```

See each subdirectory's README for detailed instructions.

## Strategy File Reference

Strategy files are declarative JSON or YAML that describe agent workflows. See [PLAN.md](../PLAN.md) for the full schema specification.
