# @comma-agents/core

Agent orchestration APIs for CommaAgents.

```bash
pnpm add @comma-agents/core@next
```

```ts
import { createAgent } from "@comma-agents/core";

const agent = createAgent({
  name: "assistant",
  model: "openai/gpt-4o",
});
```

Requires Node.js 26 or newer.
