# CommaAgents

CommaAgents is a TypeScript framework for building and running composable AI agent workflows. It provides APIs for agents, tools, hooks, and multi-agent flows; declarative JSON and YAML strategies; a background execution daemon; and a terminal interface for running and inspecting work.

The project is a Bun monorepo. Version 2 is currently published under the `next` tag.

## Quick start

Install the unified CLI with Bun 1.3 or newer:

```bash
bun add --global @comma-agents/cli@next
comma install
comma
```

`comma install` checks the local setup and configures the daemon. Running `comma` starts the daemon when needed and opens the terminal interface.

You can also install a standalone build that includes its runtime:

```bash
curl -fsSL https://commaagents.com/install | bash
```

## Develop from source

Install the workspace dependencies, then run the CLI directly from the repository:

```bash
bun install
bun run cli install
bun run cli
```

Set the environment variable required by your model provider before running a strategy, for example:

```bash
export OPENAI_API_KEY="your-api-key"
```

Useful development commands:

```bash
bun run build       # Build every workspace package
bun test            # Run package test suites
bun run lint        # Check formatting and lint rules
bun run docs        # Start the documentation site
bun run example --list
```

See the [examples](./examples/README.md) for runnable agents, strategies, and daemon clients.

## Packages

| Package | Purpose |
| --- | --- |
| [`@comma-agents/cli`](./packages/cli/) | Primary `comma` command for installation, daemon management, diagnostics, and launching the terminal interface. |
| [`@comma-agents/core`](./packages/core/) | Public framework APIs for agents, flows, strategies, tools, hooks, models, credentials, skills, and conversation context. |
| [`@comma-agents/daemon`](./packages/daemon/) | Background strategy execution service and WebSocket API used by interactive clients. |
| [`@comma-agents/tui`](./packages/tui/) | Interactive terminal client for choosing strategies, chatting with agents, reviewing output, and responding to runtime prompts. |
| [`@comma-agents/debug`](./packages/debug/) | Optional debug hooks for logging agent and flow activity during development. |
| [`@comma-agents/rlprompter`](./packages/rlprompter/) | Prompt evaluation and tuning tools driven by benchmark results and human feedback. |
| [`@comma-agents/utils`](./packages/utils/) | Private shared utilities used by other workspace packages; not part of the public API. |
| [`@comma-agents/tui-storybook`](./packages/tui-storybook/) | Private browser-based playground for developing and reviewing terminal UI components. |

The repository also contains:

- [`docs/`](./docs/) — the documentation application and API guides.
- [`examples/`](./examples/) — runnable TypeScript examples and declarative strategies.
- [`prompts/`](./prompts/) — prompt templates used by bundled workflows.

## How the pieces fit together

A strategy defines one or more agents and the flow that coordinates them. The core package loads and executes those definitions. For interactive use, the daemon owns strategy runs and streams events over its WebSocket API; the TUI connects to that API, while the CLI handles installation and process management.

You can use `@comma-agents/core` directly in a TypeScript application, run strategies through the daemon protocol, or use the `comma` terminal experience.

## License

MIT
