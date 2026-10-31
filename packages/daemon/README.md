# @comma-agents/daemon

Background execution daemon and WebSocket protocol for CommaAgents.

```bash
bun add --global @comma-agents/daemon@next
comma-agents-daemon start
```

Requires Bun 1.3 or newer.

## Browser protocol

Import the current daemon wire schemas and operation contracts from the browser-safe protocol entry point:

```ts
import { ServerMessageSchema } from "@comma-agents/daemon/protocol";
import type {
  DaemonCommandMap,
  DaemonChannelMap,
} from "@comma-agents/daemon/protocol";

const commandArguments: DaemonCommandMap["runs.get"]["arguments"] = {
  runId: "example",
};
type RunResult = DaemonCommandMap["runs.get"]["result"];
type RunEvent = DaemonChannelMap["runs"]["message"];

const socket = new WebSocket("ws://127.0.0.1:7422/ws");
socket.addEventListener("message", (event) => {
  const response = ServerMessageSchema.safeParse(JSON.parse(event.data));
  if (response.success) console.log(response.data);
});
```

`ArgumentsSchema` is also exported for validating JSON argument objects before sending requests. Binding-specific argument types come from the command and channel maps.

Command and channel contracts follow the built-in plugins' registered bindings. The main package entry point targets Bun; browser applications should use `/protocol`.

Plugins are constructed with one `createPlugin(configuration)` call. Keep command and channel registrations inline in `configuration.server`; the constructor returns the plugin immediately. Existing explicit generic calls remain supported. When retaining concrete server contracts for inference, let the call infer its configuration and use `satisfies CreateNotifyingPluginOptions<...>` on the configuration object for notification and owner type checking. This preserves the literal binding names and schemas without a separate registration catalog.

## Core provider APIs

The kernel includes a `core` plugin. Use `core.providers.list` to discover known providers, their authentication configuration status, and model metadata:

```ts
socket.addEventListener("open", () => {
  socket.send(
    JSON.stringify({
      type: "command",
      requestId: crypto.randomUUID(),
      command: "core.providers.list",
      arguments: { live: false },
    }),
  );
});
```

Successful response data is `{ providers: [...] }`. Arguments may include `scope` for scoped credential resolution and `live` to query providers that support live discovery. `live` defaults to `false`; `{}` is valid. Each provider includes its ID, display name, credential type, auth status, models, model source, and custom-registration flag. Live discovery may also include a fetch timestamp or error description. Credential values are not returned. `configured` means credentials are present, not that the provider has accepted them.

The same operation is available to daemon hosts as `kernel.plugins.core.providers.list(options)` and through the standalone `createCorePlugin()` factory. The UI hook infers its argument and response types from kernel registration:

```tsx
const { data, errors, clientError, isLoading } = useCommaAgentsDaemon(
  { command: "core.providers.list" },
  { live: false },
);
// data?.providers contains the discovered providers.
```

The same namespace exposes `getConfiguration`, `configure`, `verify`, `removeCredential`, `addCustomProvider`, `updateCustomProvider`, `removeCustomProvider`, `addCustomProviderModel`, and `removeCustomProviderModel`. Each has a matching `core.providers.*` command. Core owns the reusable provider settings and credential APIs; these remain available directly from `@comma-agents/core` without a daemon.

Provider settings persist in `.comma/provider-settings.json`, with model objects and optional metadata nested under each provider entry; credentials remain in their existing store. Custom definitions support API-key or unauthenticated endpoints. User-added model IDs are additive: removing one does not hide catalog or live-discovered models. Secret-free configuration reads include effective credential source, saved-key availability, custom endpoint fields, and manual model metadata.

`verify` makes one explicit authenticated model-list request for OpenAI, Anthropic, or Gemini, with no generation, retries, polling, or stored verification result. Other providers return `unsupported`; `verified` establishes endpoint access, not credit or generation permissions. Live discovery is explicit and uncached. Empty or failed discovery falls back to catalog data with nested discovery outcome metadata.

Removing a custom provider removes its global credential before removing its definition and models. If the settings write then fails, the operation reports `PROVIDER_REMOVAL_PARTIAL`; retry removal. Environment and strategy-scoped credentials remain unchanged.
