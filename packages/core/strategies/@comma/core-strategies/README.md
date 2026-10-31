# @comma/core-strategies

Official strategies maintained with CommaAgents. Install with:

```sh
comma hub install @comma/core-strategies
```

## Harnesses

- **Chat** — talk things through; codebase questions go to `explore`, web questions to `research`.
- **Plan** — explore, settle decisions with you, and write a decision-complete plan, then offer to switch to Build.
- **Build** — implement and verify changes; every turn that changes files ends with an independent `verify` check.

Each harness loops: it works, hands back to you, and continues with your next message. Switch between them in the same conversation at any time.

## Subagents

`explore`, `verify`, `plan-critic`, `research`, and `research-worker` live under `subagents/` and are not listed in the strategy picker. Harnesses reach them through the `delegate` tool.

## Models

Agents use model roles (`@primary`, `@subagent`, `@fast`, `@compaction`). Each strategy sets defaults in `modelRoles`; set `modelRoles` in the daemon configuration to override them everywhere.

## Legacy

QA, Talk, Reduce Complexity, and Standardize (with its internal worker) are kept unchanged from earlier releases.
