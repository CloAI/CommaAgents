# Core Examples

Example strategies for `@comma-agents/core`. Each subdirectory contains a `strategy.json` demonstrating different framework concepts.

## Runner

All core examples share a single entry point at `examples/core/run.ts`. It maintains a registry of aliases mapping to strategy files. Run any example by alias:

```sh
bun run example <alias>
```

List all available examples:

```sh
bun run example --list
```

To add a new example, drop a `strategy.json` in a new subdirectory and register it in the `EXAMPLES` map in `run.ts`.

## Examples

| Alias | Directory | Description | Concepts |
| ----- | --------- | ----------- | -------- |
| `q_a_strategy` | [simple/](./simple/) | Minimal Q&A -- user asks a question, an LLM agent answers | Sequential flow, user agent, LLM agent |

## Strategy Fields

A quick reference for the fields used in these examples:

| Field | Description |
| ----- | ----------- |
| `name` | Human-readable name for the strategy |
| `version` | Strategy schema version |
| `description` | What this strategy does |
| `flows` | Array of flow definitions |
| `flows[].name` | Flow name |
| `flows[].type` | Flow type: `sequential`, `cycle`, or `broadcast` |
| `flows[].steps` | Ordered list of steps (agents or nested flows) |
| `steps[].type` | Step type: `agent` or a flow type for nesting |
| `steps[].agent.type` | Agent type: `user` for human input, omit for LLM agents |
| `steps[].agent.model` | Model string in `providerID/modelID` format (e.g. `openai/gpt-4o`) |
| `steps[].agent.systemPrompt` | System prompt for LLM agents |
| `steps[].agent.config` | Agent-specific configuration (e.g. `requireInput` for user agents) |
