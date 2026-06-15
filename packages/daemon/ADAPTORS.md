# Adaptors — Pluggable Communication Interfaces

## Overview

Adaptors are pluggable transport interfaces that let agents communicate with users over protocols beyond WebSocket — Telegram, Signal, WhatsApp, SMS/eSIM, Discord, etc.

The entire adaptor abstraction lives in **core** (`packages/core/src/adaptors/`), following the same pattern as credential storage:

- **Core** defines the interfaces (`AdaptorBackend`, `AdaptorStore`, `AdaptorTransport`), a global registry (`setGlobalAdaptorStore` / `getGlobalAdaptorStore`), and the `withAdaptor` wrapper for scoped flow execution.
- **Daemon** provides concrete `AdaptorBackend` implementations (Telegram bot, Signal client, Twilio, etc.), registers them at startup via `setGlobalAdaptorStore()`, and manages their lifecycle.
- **Core has zero dependency on daemon.** The hierarchy remains `core → daemon → tui`.

```
core defines:                  daemon provides:
┌────────────────────┐         ┌──────────────────────────┐
│ AdaptorBackend     │◄────────│ TelegramBackend          │
│ AdaptorStore       │         │ SignalBackend             │
│ AdaptorTransport   │         │ TwilioSmsBackend          │
│ withAdaptor()      │         │ ...                       │
│ setGlobalAdaptor   │◄────────│ daemon calls at startup   │
│   Store()          │         │                           │
└────────────────────┘         └──────────────────────────┘
```

## Core Layer — `packages/core/src/adaptors/`

### File Structure

```
packages/core/src/adaptors/
  index.ts                      # barrel — exports types, factories, backends, withAdaptor
  adaptors.types.ts             # AdaptorTransport, AdaptorBackend, AdaptorStore
  adaptors.ts                   # createAdaptorStore factory
  adaptors.utils.ts             # createAdaptorCollector, createAdaptorOutputHooks
  adaptors.test.ts              # tests
  with-adaptor/
    with-adaptor.ts             # withAdaptor wrapper
    with-adaptor.types.ts       # AdaptorContext
    with-adaptor.test.ts
    index.ts
  backends/
    telegram/
      telegram.ts               # createTelegramBackend
      telegram.types.ts          # TelegramConfig
      telegram.utils.ts          # polling, API helpers
      telegram.test.ts
      index.ts
    signal/
      signal.ts                  # createSignalBackend
      signal.types.ts
      signal.utils.ts
      signal.test.ts
      index.ts
    twilio-sms/
      twilio-sms.ts              # createTwilioSmsBackend
      twilio-sms.types.ts
      twilio-sms.utils.ts
      twilio-sms.test.ts
      index.ts
```

Backends are opt-in — consumers import only what they need:

```ts
// Only pull in Telegram
import { createTelegramBackend } from "@comma-agents/core/adaptors/backends/telegram";

// Or from the top-level barrel (if re-exported)
import { createTelegramBackend } from "@comma-agents/core";
```

### Interfaces

```ts
// adaptors.types.ts

/**
 * Transport handle for a single conversation/channel.
 * A send/receive pair scoped to one user or channel.
 */
interface AdaptorTransport {
  /** Send a message to the external user/channel. */
  readonly send: (message: string) => Promise<void>;

  /** Wait for the next inbound message. Resolves when the user responds. */
  readonly receive: (signal?: AbortSignal) => Promise<string>;
}

/**
 * Low-level backend for a specific adaptor type.
 * Analogous to CredentialBackend — the daemon implements this per platform.
 */
interface AdaptorBackend {
  /** Unique adaptor type identifier, e.g. "telegram", "signal", "sms". */
  readonly id: string;

  /** Start the external connection (bot polling, webhook, etc.). */
  readonly start: () => Promise<void>;

  /** Graceful shutdown. */
  readonly stop: () => Promise<void>;

  /** Get a transport handle for a specific channel/conversation. */
  readonly getTransport: (channelId: string) => AdaptorTransport;

  /**
   * Register a handler for unsolicited inbound messages
   * (user initiates contact, not responding to a prompt).
   */
  readonly onInbound: (handler: (channelId: string, text: string) => void) => void;
}

/**
 * Adaptor store — resolves backends by ID.
 * Analogous to CredentialStore.
 */
interface AdaptorStore {
  /** Get a registered adaptor backend by ID. */
  readonly get: (adaptorId: string) => AdaptorBackend | undefined;

  /** Get a transport for a specific adaptor + channel. */
  readonly getTransport: (adaptorId: string, channelId: string) => AdaptorTransport | undefined;

  /** List all registered adaptor IDs. */
  readonly list: () => string[];
}
```

### Global Registry

```ts
// In packages/core/src/defaults/defaults.ts (alongside credential store globals)

let customAdaptorStore: AdaptorStore | undefined;

export function getGlobalAdaptorStore(): AdaptorStore | undefined {
  return customAdaptorStore;
}

export function setGlobalAdaptorStore(store: AdaptorStore | undefined): void {
  customAdaptorStore = store;
}
```

Unlike the credential store, there is **no lazy default** — if no daemon sets up adaptors, `getGlobalAdaptorStore()` returns `undefined` and adaptor features are simply unavailable. Core works fine without them.

### Prerequisite — `agentHooks` on `LoadStrategyOptions`

Before adaptors, the strategy loader needs a small addition. Today the loader accepts `flowHooks` and applies them via `hookIntoFlow()` after building each flow. But there's no equivalent for agents — the daemon currently has to manually iterate `strategy.agents` and call `hookIntoAgent()` on each one (`executor.ts:252-257`).

Adding `agentHooks` to `LoadStrategyOptions` means the loader handles this automatically:

```ts
// strategy/loader/loader.types.ts

interface LoadStrategyOptions {
  readonly inputCollector?: InputCollector;
  readonly flowHooks?: FlowHooks;
  readonly agentHooks?: AgentHooks;     // ← new
  readonly modelOverride?: string;
}
```

The loader applies them in `buildAgentRegistry` after constructing each agent:

```ts
// strategy/loader/loader.utils.ts — inside buildAgentRegistry

for (const [name, agentDefinition] of Object.entries(strategy.agents)) {
  const agent = isUserAgentDef(agentDefinition)
    ? buildUserAgent(name, agentDefinition, options)
    : buildLLMAgent(name, agentDefinition, options);

  if (options.agentHooks) {
    hookIntoAgent(agent, options.agentHooks);
  }

  registry[name] = agent;
}
```

This eliminates the manual `for...of` loop everywhere — the daemon, `withAdaptor`, and any other caller just passes `agentHooks` in the options.

The daemon's executor simplifies from:

```ts
// before
const strategy = await loadStrategyFromString(content, format, {
  inputCollector: ctx.inputCollector,
  flowHooks: buildFlowHooks(run.id),
});

for (const [agentName, loadedAgent] of Object.entries(strategy.agents)) {
  if (loadedAgent.appendHook) {
    hookIntoAgent(loadedAgent, buildAgentHooks(run.id, agentName));
  }
}
```

to:

```ts
// after
const strategy = await loadStrategyFromString(content, format, {
  inputCollector: ctx.inputCollector,
  flowHooks: buildFlowHooks(run.id),
  agentHooks: buildAgentHooks(run.id),
});
```

### `withAdaptor` — Simplified API

With `agentHooks` on the loader, `withAdaptor` becomes clean. It resolves a transport, builds the loader options, and passes them through:

```ts
// with-adaptor/with-adaptor.types.ts

interface AdaptorContext {
  /** The resolved transport for this channel. */
  readonly transport: AdaptorTransport;

  /** Loader options pre-wired to route I/O through this adaptor. */
  readonly loaderOptions: Pick<LoadStrategyOptions, "inputCollector" | "agentHooks">;
}
```

```ts
// with-adaptor/with-adaptor.ts

/**
 * Scope a block of flow execution to a specific adaptor channel.
 *
 * @param adaptorId - Registered adaptor ID (e.g. "telegram").
 * @param channelId - Channel/conversation to scope to (e.g. "chat_12345").
 * @param callback - Receives an AdaptorContext for composing flows.
 *
 * @example
 * ```ts
 * await withAdaptor("telegram", "chat_12345", async ({ loaderOptions }) => {
 *   const strategy = await loadStrategyFromString(content, "yaml", loaderOptions);
 *   await strategy.flow.call("prepare questions");
 * });
 * ```
 */
function withAdaptor(
  adaptorId: string,
  channelId: string,
  callback: (context: AdaptorContext) => Promise<void>,
): Promise<void> {
  const store = getGlobalAdaptorStore();
  if (!store) {
    throw new Error("No adaptor store configured");
  }

  const transport = store.getTransport(adaptorId, channelId);
  if (!transport) {
    throw new Error(`Adaptor "${adaptorId}" not found or channel unavailable`);
  }

  const context: AdaptorContext = {
    transport,
    loaderOptions: {
      inputCollector: createAdaptorCollector(transport),
      agentHooks: createAdaptorOutputHooks(transport),
    },
  };

  return callback(context);
}
```

### Usage Examples

**Simple — route a flow through an adaptor:**

```ts
await withAdaptor("telegram", "chat_12345", async ({ loaderOptions }) => {
  const strategy = await loadStrategyFromString(content, "yaml", loaderOptions);
  await strategy.flow.call("prepare questions");
});
```

**Merge with other options (model override, flow hooks):**

```ts
await withAdaptor("telegram", "chat_12345", async ({ loaderOptions }) => {
  const strategy = await loadStrategyFromString(content, "yaml", {
    ...loaderOptions,
    modelOverride: "openai/gpt-4o",
    flowHooks: myFlowHooks,
  });
  await strategy.flow.call("prepare questions");
});
```

**Direct transport access:**

```ts
await withAdaptor("signal", "+15551234567", async ({ transport }) => {
  await transport.send("Starting analysis...");
  const result = await flow.call("analyze the data");
  await transport.send(`Done: ${result}`);
});
```

**Without a daemon (testing):**

```ts
const mockTransport: AdaptorTransport = {
  send: async (message) => sentMessages.push(message),
  receive: async () => "user response",
};

const mockBackend: AdaptorBackend = {
  id: "mock",
  start: async () => {},
  stop: async () => {},
  getTransport: () => mockTransport,
  onInbound: () => {},
};

setGlobalAdaptorStore(createAdaptorStore([mockBackend]));

await withAdaptor("mock", "test-channel", async ({ loaderOptions }) => {
  const strategy = await loadStrategyFromString(chatStrategy, "yaml", loaderOptions);
  await strategy.flow.call("hello");
});
```

### Utility Functions

```ts
// adaptors.utils.ts

/** Create an InputCollector that sends the prompt and waits for a reply via the transport. */
function createAdaptorCollector(transport: AdaptorTransport): InputCollector {
  return async (request: InputRequest) => {
    await transport.send(request.prompt);
    return transport.receive(request.signal);
  };
}

/** Build agent hooks that forward output text through the transport. */
function createAdaptorOutputHooks(transport: AdaptorTransport): AgentHooks {
  return {
    afterCallResult: [
      async (result: AgentCallResult) => {
        if (result.text) {
          await transport.send(result.text);
        }
      },
    ],
  };
}
```

### Strategy Schema Addition

The `StrategySchema` gets an optional `adaptor` field:

```ts
// strategy/schema.ts

export const AdaptorRefSchema = z
  .object({
    /** Registered adaptor backend ID (e.g. "telegram", "signal"). */
    id: z.string().min(1),
    /** Channel/conversation ID. Supports LiquidJS templates. */
    channel: z.string().min(1),
  })
  .strict();

export const StrategySchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().optional(),
    adaptor: AdaptorRefSchema.optional(),     // ← new
    agents: z.record(AgentDefSchema),
    flow: FlowDefSchema,
  })
  .strict();
```

### Automatic Resolution in the Loader

When the strategy declares an adaptor, the loader resolves it from the global store automatically — the caller doesn't need `withAdaptor` or manual wiring:

```ts
// strategy/loader/loader.utils.ts — inside buildAgentRegistry

// If strategy declares an adaptor, resolve the transport and wire it in
if (strategy.adaptor) {
  const store = getGlobalAdaptorStore();
  if (!store) {
    throw new StrategyValidationError(
      `Strategy "${strategy.name}" declares adaptor "${strategy.adaptor.id}" ` +
        "but no adaptor store is configured. Call setGlobalAdaptorStore() first.",
    );
  }

  const transport = store.getTransport(strategy.adaptor.id, strategy.adaptor.channel);
  if (!transport) {
    throw new StrategyValidationError(
      `Strategy "${strategy.name}" declares adaptor "${strategy.adaptor.id}" ` +
        `but it is not registered in the adaptor store.`,
    );
  }

  // Override inputCollector and merge adaptor output hooks into agentHooks
  options.inputCollector = createAdaptorCollector(transport);
  options.agentHooks = mergeAgentHooks(options.agentHooks, createAdaptorOutputHooks(transport));
}
```

This means a strategy YAML just works — no programmatic wiring needed:

```yaml
name: telegram-support
version: "1.0"

adaptor:
  id: telegram
  channel: "{{channel_id}}"

agents:
  greeter:
    type: llm
    model: gpt-4o
    systemPrompt: "You are a support agent."
  user:
    type: user
    config:
      requireInput: true

flow:
  type: sequential
  name: support-flow
  steps:
    - agent: greeter
    - agent: user
    - agent: greeter
```

And the caller loads it like any other strategy:

```ts
const strategy = await loadStrategy("./telegram-support.yaml");
await strategy.flow.call("hello");
```

The loader sees `adaptor.id: telegram`, looks it up in the global adaptor store, and automatically wires `inputCollector` + `agentHooks`. If the adaptor isn't registered, it throws a clear validation error.

### Explicit `withAdaptor` Still Useful

`withAdaptor` remains for programmatic use cases where the adaptor isn't known at strategy-definition time:

- Daemon inbound routing (adaptor + channel determined at runtime by who sent the message)
- Scripts that want to dynamically pick an adaptor
- Strategies that don't declare an adaptor in YAML but get one injected by the caller

## Daemon Layer — Adaptor Manager Only

The daemon does **not** own backends. All adaptor types and their backends live in core. The daemon's only adaptor-specific code is the `AdaptorManager` — a thin orchestrator that reads config, instantiates backends from core, manages their lifecycle, and handles inbound message routing.

### File Structure

```
packages/daemon/src/adaptors/
  index.ts                       # barrel
  adaptor-manager.ts             # createAdaptorManager factory
  adaptor-manager.types.ts       # AdaptorManagerConfig, etc.
  adaptor-manager.test.ts        # tests
```

### Daemon Startup

```ts
import {
  setGlobalAdaptorStore,
  createAdaptorStore,
  createTelegramBackend,
  createSignalBackend,
} from "@comma-agents/core";

const backends: AdaptorBackend[] = [];

if (config.adaptors?.telegram?.enabled) {
  backends.push(createTelegramBackend(config.adaptors.telegram));
}
if (config.adaptors?.signal?.enabled) {
  backends.push(createSignalBackend(config.adaptors.signal));
}

setGlobalAdaptorStore(createAdaptorStore(backends));

for (const backend of backends) {
  await backend.start();
}

// On shutdown:
for (const backend of backends) {
  await backend.stop();
}
setGlobalAdaptorStore(undefined);
```

### Inbound Message Routing

When an adaptor backend receives an unsolicited message (user texts the bot), the daemon decides what to do:

```ts
for (const backend of backends) {
  backend.onInbound(async (channelId, text) => {
    const strategyName = parseCommand(text) ?? backend.defaultStrategy;

    await withAdaptor(backend.id, channelId, async ({ loaderOptions }) => {
      const strategy = await loadStrategyFromString(content, format, {
        ...loaderOptions,
        flowHooks: buildFlowHooks(run.id),
      });

      await strategy.flow.call(text);
    });
  });
}
```

### Concrete Backend Example (Telegram)

```ts
// packages/core/src/adaptors/backends/telegram/telegram.ts

function createTelegramBackend(config: TelegramConfig): AdaptorBackend {
  const pendingReceivers = new Map<string, (text: string) => void>();
  let inboundHandler: ((channelId: string, text: string) => void) | undefined;

  return {
    id: "telegram",

    async start() {
      poll(config.token, (update) => {
        const chatId = String(update.message.chat.id);
        const text = update.message.text;

        const resolver = pendingReceivers.get(chatId);
        if (resolver) {
          pendingReceivers.delete(chatId);
          resolver(text);
        } else {
          inboundHandler?.(chatId, text);
        }
      });
    },

    async stop() { /* stop polling */ },

    getTransport(channelId: string): AdaptorTransport {
      return {
        async send(message) {
          await telegramSendMessage(config.token, channelId, message);
        },
        receive(signal?: AbortSignal) {
          return new Promise<string>((resolve, reject) => {
            pendingReceivers.set(channelId, resolve);
            signal?.addEventListener("abort", () => {
              pendingReceivers.delete(channelId);
              reject(signal.reason);
            });
          });
        },
      };
    },

    onInbound(handler) { inboundHandler = handler; },
  };
}
```

## Configuration

```yaml
adaptors:
  telegram:
    enabled: true
    token: "${TELEGRAM_BOT_TOKEN}"
    default_strategy: "chat"
    allowed_users:
      - "123456789"

  signal:
    enabled: true
    signal_cli_path: "/usr/local/bin/signal-cli"
    account: "+15551234567"
    default_strategy: "chat"

  sms:
    enabled: false
    provider: "twilio"
    account_sid: "${TWILIO_SID}"
    auth_token: "${TWILIO_AUTH}"
    phone_number: "+15559876543"
```

Each backend defines its own config schema (Zod). The daemon validates at startup.

## Resolved Design Decisions

- **Auth**: Per-adaptor, per-instance. Each backend manages its own auth context. Multiple instances of the same type each have isolated auth.
- **Multi-turn sessions**: Adaptors query the daemon for their needed sessions/runs. The daemon tracks which channel maps to which run.
- **Rate limiting**: Per-adaptor. Each backend knows its platform's constraints.
- **Media**: On hold. Current agents don't support multimedia. `AdaptorTransport` can be extended later.
- **WebSocket as adaptor**: Keep WS as native transport. Review unification after the first adaptor implementation, only if it reduces complexity.

## Candidate Adaptors

| Adaptor | Transport | Notes |
|---|---|---|
| **Telegram** | Bot API (HTTP polling / webhook) | Rich formatting, inline keyboards for confirmations |
| **Signal** | signal-cli or signald (JSON-RPC over socket) | End-to-end encrypted |
| **WhatsApp** | WhatsApp Business API or Baileys | Rate limits, session management |
| **SMS/eSIM** | Twilio / Vonage / direct modem AT commands | Plain text only, character limits |
| **Voice/Call** | Twilio Voice / SIP | Would need speech-to-text / text-to-speech layer |
| **Discord** | Discord.js bot | Channel-based, rich embeds |
| **Slack** | Bolt SDK | Workspace integration, threads |
| **Matrix** | matrix-js-sdk | Federated, self-hostable |
| **HTTP/REST** | Express/Hono endpoint | Stateless request/response for integrations |

## Authoring a Custom Adaptor

Creating a custom adaptor requires implementing `AdaptorBackend` from `@comma-agents/core`. The backend is a factory function that returns the interface — no classes, no inheritance.

### Minimal Example — Webhook Adaptor

A simple adaptor that receives messages via HTTP POST and sends responses back to a callback URL:

```ts
// my-webhook-adaptor.ts

import type { AdaptorBackend, AdaptorTransport } from "@comma-agents/core";

interface WebhookAdaptorConfig {
  readonly port: number;
  readonly callbackUrl: string;
}

function createWebhookBackend(config: WebhookAdaptorConfig): AdaptorBackend {
  const pendingReceivers = new Map<string, (text: string) => void>();
  let inboundHandler: ((channelId: string, text: string) => void) | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;

  return {
    id: "webhook",

    async start() {
      server = Bun.serve({
        port: config.port,
        async fetch(request) {
          if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405 });
          }

          const body = await request.json();
          const channelId = body.channelId;
          const text = body.text;

          // If a flow is waiting for input on this channel, resolve it
          const resolver = pendingReceivers.get(channelId);
          if (resolver) {
            pendingReceivers.delete(channelId);
            resolver(text);
          } else {
            // No one waiting — treat as unsolicited inbound
            inboundHandler?.(channelId, text);
          }

          return new Response("ok");
        },
      });
    },

    async stop() {
      server?.stop();
    },

    getTransport(channelId: string): AdaptorTransport {
      return {
        async send(message) {
          await fetch(config.callbackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channelId, message }),
          });
        },

        receive(signal?: AbortSignal) {
          return new Promise<string>((resolve, reject) => {
            pendingReceivers.set(channelId, resolve);
            signal?.addEventListener("abort", () => {
              pendingReceivers.delete(channelId);
              reject(signal.reason);
            });
          });
        },
      };
    },

    onInbound(handler) {
      inboundHandler = handler;
    },
  };
}
```

### Registering with the Daemon

If running inside the daemon, add the backend to the daemon config and startup:

```ts
import { setGlobalAdaptorStore, createAdaptorStore } from "@comma-agents/core";
import { createWebhookBackend } from "./my-webhook-adaptor";

const backends = [
  createWebhookBackend({ port: 8080, callbackUrl: "https://example.com/hook" }),
  // ...other backends
];

setGlobalAdaptorStore(createAdaptorStore(backends));

for (const backend of backends) {
  await backend.start();
}
```

### Using Standalone (No Daemon)

Adaptors work without a daemon. This is useful for scripts, tests, or embedding in other applications:

```ts
import {
  createAdaptorStore,
  setGlobalAdaptorStore,
  withAdaptor,
  loadStrategyFromFile,
  createWebhookBackend,
} from "@comma-agents/core";

const backend = createWebhookBackend({ port: 8080, callbackUrl: "https://example.com/hook" });
setGlobalAdaptorStore(createAdaptorStore([backend]));
await backend.start();

await withAdaptor("webhook", "channel-1", async ({ loaderOptions }) => {
  const strategy = await loadStrategyFromFile("./my-strategy.yaml", loaderOptions);
  await strategy.flow.call("hello");
});

await backend.stop();
```

### The Pattern

Every adaptor follows the same structure:

1. **A config type** — Zod schema for validation, plain interface for the factory.
2. **A factory function** — `createXxxBackend(config): AdaptorBackend`.
3. **Closure state** — pending receivers map, connection handles, inbound handler.
4. **`start()`** — opens the external connection (polling loop, HTTP server, socket, etc.).
5. **`stop()`** — tears it down.
6. **`getTransport(channelId)`** — returns a `{ send, receive }` pair scoped to one conversation.
7. **`onInbound(handler)`** — lets the daemon (or your own code) react to unsolicited messages.

The `send`/`receive` contract on `AdaptorTransport` is the only thing flows and agents care about. Everything else — polling, webhooks, WebSocket connections, API auth, rate limiting — is internal to the backend.

### Handling the `receive` Promise

The common pattern across all adaptors: `receive()` creates a Promise and stores its `resolve` in a map keyed by `channelId`. When an inbound message arrives for that channel, the resolver is pulled from the map and called. This is the same rendezvous pattern the daemon's input bridge already uses.

Always support `AbortSignal` on `receive` — this lets the framework cancel pending input collection when a strategy is stopped or times out.

## Implementation Plan

1. **Add `agentHooks` to `LoadStrategyOptions`** — the loader applies them via `hookIntoAgent()` after building each agent, mirroring how `flowHooks` already works. This is useful independent of adaptors (simplifies the daemon's executor too).
2. **Define types in core** — `AdaptorTransport`, `AdaptorBackend`, `AdaptorStore` in `packages/core/src/adaptors/adaptors.types.ts`
3. **Add `createAdaptorStore`** — factory in `packages/core/src/adaptors/adaptors.ts`
4. **Add global registry** — `get/setGlobalAdaptorStore` in `packages/core/src/defaults/defaults.ts`
5. **Build utilities** — `createAdaptorCollector`, `createAdaptorOutputHooks` in `adaptors.utils.ts`
6. **Build `withAdaptor`** — in `packages/core/src/adaptors/with-adaptor/`
7. **Add `adaptor` field to strategy schema** — optional, resolved at load time
8. **Implement Telegram backend in core** — `packages/core/src/adaptors/backends/telegram/`
9. **Refactor daemon executor** — replace manual `hookIntoAgent` loop with `agentHooks` option
10. **Build `AdaptorManager` in daemon** — `packages/daemon/src/adaptors/adaptor-manager.ts` (config loading, lifecycle, inbound routing)
11. **Wire into daemon startup** — `setGlobalAdaptorStore()` at boot, cleanup at shutdown
