# Core Strategy Examples

Example strategies for `@comma-agents/core`. Each subdirectory contains a `strategy.json` or `strategy.yaml` demonstrating different framework concepts.

## Runner

All strategy examples share a single entry point at `examples/core/strategies/run.ts`. It maintains a registry of aliases mapping to strategy files. Run any example by alias:

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
| `code_review` | [code-review/](./code-review/) | Code review pipeline -- reviewer examines code, editor applies fixes | Sequential flow, agent chaining |
| `research_team` | [research-team/](./research-team/) | Parallel research -- historian, scientist, and philosopher answer from different perspectives | Broadcast flow, YAML format |
| `iterative_refinement` | [iterative-refinement/](./iterative-refinement/) | Iterative writing loop -- writer drafts, reviewer critiques, cycles until approved | Cycle flow, `maxIterations`, `stopPhrase` |
| `tool_agent` | [tool-agent/](./tool-agent/) | Tool-using agent -- agent with filesystem tools answers questions about the codebase | Tools, YAML format, built-in tools |

## Strategy Fields

A quick reference for the fields used in these examples:

| Field | Description |
| ----- | ----------- |
| `name` | Human-readable name for the strategy |
| `version` | Strategy schema version (e.g. `"1.0"`) |
| `description` | What this strategy does |
| `defaults` | Optional defaults block (`model`, `tools`, `systemPrompt`) inherited by agents with `useDefaults: true` |
| `agents` | Named registry of agent definitions (keyed by agent name) |
| `agents.<name>.type` | `"user"` for human input agents, `"llm"` or omit for LLM agents |
| `agents.<name>.model` | Model string in `provider/model` format (e.g. `openai/gpt-4o`) |
| `agents.<name>.systemPrompt` | System prompt for LLM agents |
| `agents.<name>.tools` | Array of tool names (built-in: `bash`, `read`, `write`, `edit`, `glob`, `grep`) |
| `agents.<name>.useDefaults` | Inherit from the `defaults` block |
| `flow` | Single entry flow definition (the root of the flow tree) |
| `flow.type` | Flow type: `sequential`, `cycle`, or `broadcast` |
| `flow.name` | Flow name |
| `flow.steps` | Ordered list of steps — agent references (`{ agent: "name" }`) or nested flows |
| `flow.cycles` | (cycle only) Max iterations, or `"Infinity"` |
| `flow.observer` | (cycle only) Agent name for the cycle observer |
| `flow.separator` | (broadcast only) String separator between parallel results |
