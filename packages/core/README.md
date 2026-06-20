# @comma-agents/core

Agent orchestration APIs for CommaAgents.

```bash
bun add @comma-agents/core@next
```

```ts
import { createAgent } from "@comma-agents/core";

const agent = createAgent({
  name: "assistant",
  model: "openai/gpt-4o",
});
```

Requires Bun 1.3 or newer.
