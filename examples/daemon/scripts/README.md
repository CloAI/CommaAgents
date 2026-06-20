# @comma-agents/daemon — Examples

Runnable examples demonstrating the daemon WebSocket API. Each example connects to a running daemon instance and executes strategy flows through the wire protocol.

## Prerequisites

1. Install dependencies from the workspace root:

   ```sh
   bun install
   ```

2. Install a provider package (at least one):

   ```sh
   bun add @ai-sdk/openai            # for openai/* models
   bun add @ai-sdk/anthropic          # for anthropic/* models
   ```

3. Set the corresponding API key environment variable:

   ```sh
   export OPENAI_API_KEY=sk-...
   ```

4. **Start the daemon**:

   ```sh
   comma daemon start
   ```

   By default the daemon listens on `ws://127.0.0.1:7422/ws`. Override with `DAEMON_URL`.

## Running

From the project root:

```sh
bun run examples/daemon/scripts/01-basic-client.ts
bun run examples/daemon/scripts/02-streaming-client.ts
bun run examples/daemon/scripts/03-interactive-flow.ts
bun run examples/daemon/scripts/04-multi-flow.ts
```

Pass an optional strategy file path as the first argument:

```sh
bun run examples/daemon/scripts/01-basic-client.ts examples/core/strategies/simple/strategy.json
```

## Examples

| # | File | Description |
|---|------|-------------|
| 01 | [`01-basic-client.ts`](01-basic-client.ts) | **Basic Client** — connect to the daemon, prepare and start a strategy run, and handle run lifecycle events. The simplest possible daemon client. |
| 02 | [`02-streaming-client.ts`](02-streaming-client.ts) | **Streaming Client** — consume real-time `agent_streaming` events to render tokens as they arrive. Shows text deltas, tool-call events, and tool-result events in a live terminal display. |
| 03 | [`03-interactive-flow.ts`](03-interactive-flow.ts) | **Interactive Flow** — handle `request_input` events for human-in-the-loop flows. Uses readline to prompt the user in the terminal and sends `user_input` responses back to the daemon. Creates a temporary strategy with a UserAgent if no strategy path is provided. |
| 04 | [`04-multi-flow.ts`](04-multi-flow.ts) | **Multi-Flow Client** — run multiple strategy flows concurrently through a single WebSocket connection. Demonstrates `requestId` correlation, per-flow tracking, `list_flows`/`flow_list` messages, and flow status dashboards. |

## Wire Protocol Quick Reference

### Client → Daemon

| Message | Purpose |
|---------|---------|
| `ping` | Keepalive; daemon responds with `pong` |
| `prepare_run` | Load a strategy and create a pending run |
| `start_run` | Start a prepared run |
| `stop_run` | Cancel a running run by run ID |
| `user_input` | Respond to a `request_input` prompt |
| `list_runs` | Request a list of persisted runs |
| `subscribe` | Subscribe to events from a specific run |
| `unsubscribe` | Unsubscribe from a run's events |

### Daemon → Client

| Message | Purpose |
|---------|---------|
| `pong` | Response to `ping` |
| `run_prepared` | A run has been prepared and can be started |
| `strategy_started` | Strategy execution has begun |
| `step_started` | A flow step is starting |
| `step_completed` | A flow step has finished |
| `agent_output` | Final agent output (non-streaming) |
| `agent_streaming` | Real-time streaming event (text, tool-call, tool-result, done) |
| `strategy_completed` | Strategy finished successfully |
| `strategy_error` | Strategy encountered an error |
| `run_list` | Response to `list_runs` |
| `request_input` | Daemon needs user input |
| `error` | Protocol-level error |

## Key Concepts

- **Strategy files** — JSON or YAML files that define agent flows. See `examples/core/strategies/` for strategy examples.
- **Run ID** — each `prepare_run` creates or loads a run. All subsequent events for that execution carry the same `runId`.
- **Request ID** — optional client-provided ID echoed back on responses for request/response correlation.
- **Auto-subscribe** — the client that starts a flow is automatically subscribed to its events. Other clients can `subscribe` by run ID.
- **Input bridge** — when a UserAgent needs input, the daemon broadcasts `request_input` and blocks until a `user_input` response is received.
