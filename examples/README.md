# Examples

Example strategies and configurations for CommaAgents v2. Each subdirectory corresponds to a framework package and contains runnable examples demonstrating its features.

## Categories

| Directory | Package | Description |
| --------- | ------- | ----------- |
| [core/](./core/) | `@comma-agents/core` | Strategy files showcasing agents, flows, hooks, and tools |

More categories (e.g. `daemon/`, `tui/`) will be added as those packages mature.

## Running Examples

All examples can be run from the project root via a single `example` script:

```sh
bun run example <alias>
```

List all available examples:

```sh
bun run example --list
```

See each category's README for a full list of aliases and what they demonstrate.

## Strategy File Reference

Strategy files are declarative JSON (YAML support planned) that describe agent workflows. See [PLAN.md](../PLAN.md) for the full schema specification.
