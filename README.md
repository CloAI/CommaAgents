# CommaAgents

CommaAgents is a TypeScript framework for building and running AI agent
workflows. You can create individual agents, give them tools, compose them into
multi-agent flows, or describe an entire workflow in JSON or YAML.

Use the terminal application for an interactive experience, embed
`@comma-agents/core` in a TypeScript project, or run long-lived workflows
through the background daemon. The same agent and flow contracts are used
across each entry point.

CommaAgents v2 is currently published under the `next` tag and requires Bun 1.3
or newer.

## Installation

Install the unified CLI:

```bash
bun add --global @comma-agents/cli@next
comma install
```

`comma install` checks your local environment and configures the background
daemon.

You can also install a standalone build that includes its runtime:

```bash
curl -fsSL https://commaagents.com/install | bash
```

## Quick start

Set the environment variable required by your model provider:

```bash
export OPENAI_API_KEY="your-api-key"
```

Then open CommaAgents:

```bash
comma
```

The CLI starts the daemon when needed and opens the terminal interface. From
there you can choose a strategy, provide a task, follow agent and tool activity,
respond to runtime prompts, and inspect previous runs.

## Build an agent with TypeScript

Install Core when you want to use CommaAgents inside an application:

```bash
bun add @comma-agents/core@next
```

Create an agent and send it a message:

```ts
import { createAgent } from "@comma-agents/core";

const assistant = createAgent({
  name: "assistant",
  model: "openai/gpt-4o",
  systemPrompt: "You are a concise TypeScript assistant.",
});

const result = await assistant.call(
  "Explain when to use a discriminated union.",
);

console.log(result.text);
```

Agents can maintain conversation history, stream responses, call tools, return
structured output, and run lifecycle hooks. Use `call()` when you need the final
result or `stream()` when you want events as they arrive.

## Compose multi-agent workflows

Flows coordinate agents using a shared interface. A sequential flow passes each
step's output to the next step:

```ts
import {
  createAgent,
  createSequentialFlow,
} from "@comma-agents/core";

const analyst = createAgent({
  name: "analyst",
  model: "openai/gpt-4o",
  systemPrompt: "Identify correctness risks in the supplied code.",
});

const reviewer = createAgent({
  name: "reviewer",
  model: "openai/gpt-4o",
  systemPrompt: "Turn the analysis into concise, actionable review comments.",
});

const reviewFlow = createSequentialFlow({
  name: "code-review",
  steps: [analyst, reviewer],
});

const result = await reviewFlow.call("Review: const total = price * quantity;");
console.log(result.text);
```

CommaAgents includes three built-in flow types:

- **Sequential** runs steps in order and passes output through the pipeline.
- **Broadcast** runs multiple steps against the same input.
- **Cycle** repeats a set of steps until its completion condition is met.

Flows can contain agents or other flows, so larger workflows remain
composable.

## Define strategies in JSON or YAML

Strategies describe agents and their orchestration without requiring TypeScript
code. This makes workflows easy to store, share, version, and load at runtime.

```yaml
name: Review Pipeline
version: "1.0"
agents:
  analyst:
    model: openai/gpt-4o
    systemPrompt: Identify bugs, edge cases, and maintainability risks.
  reviewer:
    model: openai/gpt-4o
    systemPrompt: Convert the analysis into actionable review comments.
flow:
  name: Code Review
  type: sequential
  steps:
    - agent: analyst
    - agent: reviewer
```

Load and run the strategy:

```ts
import { loadStrategy } from "@comma-agents/core";

const strategy = await loadStrategy("./code-review.yaml");
const result = await strategy.flow.call("Review the supplied module.");

console.log(result.text);
```

The declarative format supports agents, nested flows, built-in tools, custom
tools, hooks, prompts, model options, and interactive user steps.

## What you can build

CommaAgents provides the primitives for:

- Coding assistants that inspect files, run commands, and edit a workspace.
- Review, planning, research, and content pipelines with specialized agents.
- Interactive workflows that pause for user input or approval.
- Parallel analysis with results combined into a final response.
- Repeatable JSON or YAML strategies shared across projects and teams.
- TypeScript applications that need tool calling, streaming, structured output,
  conversation context, or cancellation.
- Long-running agent work observed by terminal or custom WebSocket clients.

## How the pieces fit together

A **strategy** defines agents and the flow that coordinates them.
`@comma-agents/core` loads and executes those definitions.

For interactive use, the **daemon** owns strategy runs and streams their events
over a WebSocket API. The **TUI** displays those runs and collects user input.
The **CLI** handles installation, daemon management, diagnostics, and launching
the terminal interface.

You can use Core directly without the daemon or TUI when embedding agents in
your own application.

## CommaAgentsHub

[CommaAgentsHub](https://github.com/CloAI/CommaAgentsHub) is the community
registry for reusable CommaAgents packages. Hub packages can publish
strategies, agents, tools, and custom flows through a versioned
`comma-project.json` manifest.

The official strategy collection and community packages can be discovered from
CommaAgents without copying their source into your project.

## Packages

| Package | Purpose |
| --- | --- |
| [`@comma-agents/cli`](./packages/cli/) | Primary `comma` command for installation, daemon management, diagnostics, and launching the terminal interface. |
| [`@comma-agents/core`](./packages/core/) | Public APIs for agents, flows, strategies, tools, hooks, models, credentials, skills, Hub packages, and conversation context. |
| [`@comma-agents/daemon`](./packages/daemon/) | Background strategy execution service and WebSocket API used by interactive clients. |
| [`@comma-agents/tui`](./packages/tui/) | Interactive terminal client for choosing strategies, chatting with agents, reviewing output, and responding to runtime prompts. |
| [`@comma-agents/debug`](./packages/debug/) | Optional debug hooks for logging agent and flow activity during development. |
| [`@comma-agents/rlprompter`](./packages/rlprompter/) | Prompt evaluation and tuning tools driven by benchmark results and human feedback. |
| [`@comma-agents/utils`](./packages/utils/) | Private shared utilities used by other workspace packages; not part of the public API. |
| [`@comma-agents/tui-storybook`](./packages/tui-storybook/) | Private browser-based playground for developing and reviewing terminal UI components. |

The repository also contains:

- [`docs/`](./docs/) — the documentation application and API guides.
- [`examples/`](./examples/) — runnable TypeScript examples and declarative
  strategies.
- [`prompts/`](./prompts/) — prompt templates used by bundled workflows.

## Develop from source

Install the workspace dependencies and run the CLI:

```bash
bun install
bun run cli install
bun run cli
```

Useful development commands:

```bash
bun run build          # Build every workspace package
bun test               # Run package test suites
bun run lint           # Check formatting and lint rules
bun run docs           # Start the documentation site
bun run docs:build     # Build the documentation site
bun run example --list # List runnable strategy examples
bun run daemon         # Start the daemon in the foreground
```

See the [examples](./examples/README.md) for runnable agents, strategies, and
daemon clients.

## Contributing

Contributions can add framework features, runtime integrations, documentation,
tests, or reusable packages.

1. Fork and clone the repository.
2. Create a focused branch for the change.
3. Install dependencies with `bun install`.
4. Run the relevant tests and `bun run lint`.
5. Open a pull request that explains the behavior and verification performed.

Reusable community strategies, agents, tools, and flows should be contributed
through [CommaAgentsHub](https://github.com/CloAI/CommaAgentsHub).

## Documentation and links

- [Documentation](https://commaagents.com/docs)
- [Examples](./examples/README.md)
- [CommaAgentsHub](https://github.com/CloAI/CommaAgentsHub)
- [Issue tracker](https://github.com/CloAI/CommaAgents/issues)

## License

CommaAgents is available under the [MIT License](./packages/core/LICENSE).
