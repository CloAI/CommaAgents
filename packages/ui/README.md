# @comma-agents/ui

Browser interface prototype for Comma Agents, with the animated ASCII logo and a prompt composer. This private workspace package runs from the repository checkout.

Requires Bun 1.3 or newer.

## Run

From the repository root:

```bash
bun install
bun run ui
```

Open the development server URL, normally `http://localhost:5173`.

Enter a prompt and press Enter or select Send to prepare and start a run of the selected strategy; the pane then opens the run, printing each agent's streamed text as plain text. Shift+Enter adds a newline. Sending trims surrounding whitespace and preserves your draft; whitespace-only prompts cannot be sent. The app connects to the configured daemon. In an existing conversation, send another message to continue a finished run, answer a pending question, or steer an active agent. Successful submissions clear the composer; failed submissions retain the draft.

The composer starts at one line and grows with wrapped or pasted text up to three visible lines. Longer prompts scroll inside the field, and removing text shrinks it again. The up-arrow Send action sits inside the bottom-right of the composer. When the prompt overflows, a thin, theme-colored scrollbar sits at the far-right edge and Send shifts left to leave room. Without overflow, Send stays at the normal right inset. Sizing adapts to the available width and font loading; manual resizing is disabled.

The logo animates automatically at 16 frames per second without playback controls. A reduced-motion preference shows a static frame.

The compact icon rail stays on the left, with New Chat at the top and Settings at the bottom. New Chat currently shows a placeholder alert. Settings opens a modal dialog. Both leave your prompt unchanged. Hover an icon to see its action name, or reach it with keyboard navigation.

## Panes and routes

The workspace is a resizable grid of chat panes. Each pane has a small header with its title and actions on the right: split vertical (a new pane beside this one), split horizontal (a new pane below), full screen (fills the workspace; press again to restore the grid) and close. With only one pane, full screen and close are hidden. Drag a pane's header onto an edge of another pane to dock it there as a split. Dividers resize panes; panes keep a minimum size and the grid holds at most eight.

Each pane has its own route: `/` is a new chat (strategy and model controls and the composer; the logo hides when the pane is short) and `/runs/<id>` follows a run's output. Starting a run from a new chat opens its route in the same pane. Strategy choices belong to each new-chat pane for the session. The address bar shows the focused pane's route as `/#/runs/<id>` and a route in the address bar at launch opens in the focused pane. The grid, each pane's route and the focused pane are saved in the browser and restored on reload; full screen is not saved.

While a model-backed agent is running, select the square **Stop** button beside Send to cancel the run. Stop and its keyboard shortcut are unavailable when only a user-input step is waiting. You can also press **Escape twice within 1.5 seconds** in the active conversation pane, including when focus is on its header or the page body. The first press shows “Press Escape again to stop this chat” above Stop; the hint disappears when the shortcut expires, you type, click, or switch panes. A single Escape, a held key, or Escape used to dismiss a picker or dialog does not stop the run. Stopping keeps your unsent draft and the output received so far.

## Read conversation content

Conversation text uses a system sans-serif font; inline code, code blocks, and tool arguments/output use Geist Mono at the same 1rem size. Headings, lists, and tables retain their hierarchy. Long code lines scroll horizontally. Message cards and the composer share aligned edges, with stable spacing when the conversation begins or stops scrolling.

Consecutive tool calls appear as one collapsed group with progress and failure counts. Expand the group to inspect individual calls and their arguments/output. Your expansion choices stay in place as updates arrive. Running and failed delegated jobs remain visible with an Open action even when the group is collapsed; successfully completed jobs appear inside the expanded group.

## Switching strategies

Use the strategy picker below the chat input to change an existing conversation from Plan to Build, or to any other installed strategy. The selection is saved immediately and appears in every pane following the conversation. Send your next message to start the selected strategy. Earlier user and agent text is available as attributed context; raw tool output is excluded from the handoff. The picker opens above or below its button depending on the available space, stays within the window, and follows the button when panes scroll or resize.

If work is running or waiting for your reply, choose **Stop and switch** to interrupt it and select the replacement, or **Wait** to dismiss the dialog. Wait does not queue a switch. Successful changes appear in the conversation timeline. A failed switch keeps the previous selection and draft; work that was already stopped remains stopped. If the saved strategy is unavailable, choose another before sending.

Model controls apply to this conversation. Each strategy remembers its own settings, including when you switch back. New conversations use your saved per-strategy preferences as defaults.

Before sending a request estimated to exceed the model's context budget, choose **Compact**, **Send recent messages**, or **Continue with full history**. Compact summarizes older discussion using the target strategy's model and keeps recent messages. Sending recent messages includes up to eight prior messages that fit; the dialog shows the count. Continuing attempts the full history without trimming. Context estimates may differ from the provider's count. Execution errors are displayed normally and preserve your draft; they do not open or reopen the context-choice dialog. These choices preserve the full visible chat history.

## Daemon connection indicator

A compact half capsule sits flush with the bottom-right corner, with only the top-left corner rounded. The dot is centered with internal spacing and a subtle 1px shaded border. Its dot is green while connected to the daemon and red while connecting or reconnecting. Hover over it or focus it with the keyboard to slide out the Daemon label. Connection changes are also announced to screen readers. Reduced-motion preferences disable the transition.

The design-system component includes a yellow warning state for future latency or connection-health checks. Ping monitoring is not enabled yet.

## Daemon logs

Click the connection capsule, or focus it and press Enter or Space, to open Daemon logs. The dialog updates live with connection activity and daemon-related errors. Search messages and details, or select a severity to narrow the display. The count shows matching and total retained entries.

Logs use ISO timestamps. Adjacent identical messages display a repeat count and the most recent occurrence time. Long lines scroll horizontally. Opening the dialog shows the newest matching entry; new messages follow while you are at the bottom. Scroll up to inspect history without jumping back down. Changing search or severity shows the newest matching result.

Copy all copies the entire retained history, including entries hidden by filters. Clear removes the entire history. Closing the dialog keeps history; reopening resets search and severity. If copying is unavailable, select the text to copy it manually.

The daemon retains up to 100 entries in memory for the current tab, dropping the oldest. History survives reconnects and endpoint changes but clears on reload. Entry text has no size limit. Logs include operation names, request IDs, error codes and messages; request arguments, response payloads, error metadata, and endpoint query values are omitted. Browser developer tools also receive each logged occurrence. Connection errors do not change the dot's status policy; yellow health monitoring remains reserved for later.

## Settings

Open Settings and select General Settings to edit the daemon WebSocket URL. Its default is `ws://127.0.0.1:7422/ws`. Appearance, Hub, and Privacy are placeholders. The app connects automatically using this URL. Authentication settings are not available yet.

Select Save in General Settings to validate and store the URL. Surrounding whitespace is trimmed. URLs must use `ws:` or `wss:` and include a hostname; custom paths and query strings are allowed, but fragments and embedded credentials are rejected. A successful save shows Saved for three seconds and keeps the dialog open.

Cancel, the close button, or Escape discards unsaved changes. Clicking the backdrop does not dismiss the dialog. Switching sections retains your draft. Reopening Settings selects General Settings and loads the saved value.

Settings are saved in this browser for the current origin. They load once when the app starts; changes from another tab appear after reloading. A missing value uses defaults. Malformed or unsupported stored settings show a notice and use defaults without replacing the stored value until you explicitly save. If storage cannot be written, the draft and previously active settings are retained so you can retry.

The settings dialog has a fixed height of 34rem, capped to fit shorter screens. Long sections scroll inside the dialog while navigation and actions remain visible.

## Providers

Open Settings and select Providers to browse the daemon's provider and model catalog. Discovery runs when you enter the panel, using the saved daemon connection and `core.providers.list` with `live: false`. Loading and request failures appear in the panel.

Select **Refresh** beside a provider to call `core.providers.refresh` with its `providerId`, refresh the shared catalog, and fetch only that provider's live models. Results update that provider while retaining other providers and filters. Its current list stays visible during refresh and after a command failure; select the button again to retry.

Search provider names/IDs or model names/IDs/families, search and choose providers in the provider picker, and toggle model capability filters: Tools, Reasoning, Vision, Attachments, Structured output, TEE attestation support, and E2EE support. Text matching is case-insensitive. Multiple capability filters require every selected capability; missing capability metadata does not count as support. Filters combine locally without additional daemon requests. Privacy badges describe provider-reported support, not verified attestation or active request encryption.

Providers start collapsed, with the matching model count beside each provider name. Expand a provider to see all matching models with their existing name, qualified ID, provider, and capability icons. Pagination is temporarily disabled; its component and commented call site are retained for future use. Search and capability changes return provider sections to their collapsed state. Literal, case-insensitive matches are highlighted in provider names, model names, IDs, and picker options.

Each provider row shows Connected when effective credentials exist or authentication is not required. A successful supported credential check shows Verified for the current provider-settings view. A failed check shows a warning; providers requiring an absent key show Needs credentials. These labels describe configuration or an authenticated model-list check, not a persistent provider connection or guaranteed generation access.

Connect and Configure open one workflow dialog above Settings. Enter a new key and select Save to persist it, verify automatically where supported, and reload providers. Existing keys are never returned or prefilled. Environment credentials take precedence over saved global keys. If verification fails, Continue retains the saved configuration or Edit returns to the populated form. Providers without a verification endpoint remain Connected without a check. A failed reload offers Retry reload without repeating the save or verification.

For OpenAI, choose **ChatGPT subscription** in the connection dialog, then **Continue with ChatGPT**. Complete authorization in the browser; a fallback link is shown if a new tab is blocked. The browser and daemon must run on the same computer. Sign-in checks identity and plan permission without a test generation, then reloads providers. Tokens stay on the daemon and renew when needed. Environment API keys retain precedence. **Manage ChatGPT usage** opens the account's usage controls. Removing a saved sign-in is local credential removal; remote access can be revoked through those controls. This first version reconnects one saved ChatGPT registration; account switching and Anthropic subscription sign-in are deferred.

Select Add model to choose a provider and enter one provider-local model ID. All metadata is optional: display name, capabilities, token limits, modalities, dates, status, and pricing. Click capability buttons to enable support; unselected capabilities remain unspecified. The selected provider supplies the provider prefix automatically, and pasted redundant provider prefixes are removed. Provider-specific model namespaces are preserved. Advanced metadata is collapsible. Manual metadata fills missing catalog/live values; it does not override known information. Existing manual IDs cannot be added again to silently replace metadata.

Select + Provider to create a custom compatible endpoint with an immutable ID, display name, complete HTTP(S) API prefix, and API-key or unauthenticated mode. The API key is optional and can be configured later. Enter optional initial model IDs one per line; each is saved with a separate command after the provider is created. Duplicate IDs are ignored, and a retry resumes model additions without repeating completed entries. An endpoint saved without its required key remains visible, including when it has no models. If creation succeeds but a later key or model save fails, retry edits the saved provider rather than creating it again.

User-owned endpoint definitions can be edited or removed. Removing one also removes its saved global key and manual models; environment and strategy credentials are unchanged. Custom model removal deletes only the manual entry, so a catalog/discovered model may remain visible. Manual entries, including duplicates of catalog IDs, can be removed from Configure. Confirmations and failure steps stay inside the same workflow dialog.

Changes reload the provider list while preserving its current search, filters, and expanded rows. Input drafts and errors stay within their workflow. Provider settings and credentials are stored by core on the daemon; the browser stores only its existing UI settings. Search and verification display reset when the provider section is unmounted. No background provider checks, live discovery, or verification history are introduced.

## Daemon hooks

Use `useDaemonMutation(command)` for explicit form submissions. Its typed `mutate(args)` sends an ordinary daemon command and returns the correlated result. It does not run on mount, queue saves while disconnected, or replay a sent command after reconnecting. Its `data`, `errors`, `clientError`, and `isLoading` fields describe the current submission. Automatic reads and subscriptions continue using `useCommaAgentsDaemon`.

`App` nests `CommaAgentsDaemonProvider` inside `SettingsProvider`. Components under that provider share one connection using the saved daemon URL. A successful settings save switches the endpoint; an unsuccessful save leaves the active connection unchanged.

Commands run automatically when the hook mounts and when its arguments change. The selector determines argument and response types from the daemon's registered plugin contracts:

```tsx
import { useCommaAgentsDaemon } from "./hooks/useCommaAgentsDaemon";

function RunDetails({ runId }: { runId: string }) {
  const { data, errors, clientError, isLoading } = useCommaAgentsDaemon(
    { command: "runs.get" },
    { runId },
  );

  return (
    <pre>
      {JSON.stringify({ data, errors, clientError, isLoading }, null, 2)}
    </pre>
  );
}
```

Commands wait for the shared connection before their first send. Changing arguments or the saved endpoint starts a new operation and clears the previous result. Equivalent argument values keep the existing operation. Only responses for the current operation update the hook. Unmounting stops local delivery; an already-sent command may still complete on the daemon. The hook exposes no manual execution control.

Channels subscribe automatically:

```tsx
import { useCommaAgentsDaemon } from "./hooks/useCommaAgentsDaemon";

function RunEvents({ runId }: { runId: string }) {
  const { data, errors, clientError, isLoading } = useCommaAgentsDaemon(
    { channel: "runs" },
    { runId },
  );

  return (
    <pre>
      {JSON.stringify({ data, errors, clientError, isLoading }, null, 2)}
    </pre>
  );
}
```

Channel `data` contains the latest complete `{ type, data }` domain event. It replaces the previous event; consumers can maintain their own history if needed. A subscription acknowledgement clears `isLoading` without becoming `data`. Each hook has an independent request ID and result. Unmounting unsubscribes with the original ID. Equivalent JSON arguments, including objects with different key order, keep a subscription; meaningful argument changes replace it and clear its result. Unsupported values and cycles produce `clientError`.

`errors` preserves the daemon error object, including metadata. `clientError` reports connection, timeout, invalid-argument, or malformed-message failures separately. Unsent commands remain pending until the connection opens; commands already sent fail if the connection closes and are never replayed on reconnect. Responses and subscription acknowledgements time out after ten seconds; a quiet acknowledged channel has no event timeout.

The connection retries after 2, 4, 8, 16, then 30 seconds, capped at 30 seconds. Opening successfully resets the delay. Active channels resubscribe with fresh IDs after reconnecting to the same endpoint and retain their last event. Completed or server-rejected channels stay stopped. Changing the endpoint clears results. Invalid frames fail active operations locally.

For other transports, `useWebSocket({ url, onMessage, onStatus })` exposes raw messages, connection status, and an immediate `send` callback that returns whether the message was sent. It has no outgoing queue. Daemon envelope schemas and inferred operation maps are available from the browser-safe `@comma-agents/daemon/protocol` export.

## Log buckets

Create an explicit bucket for a feature and observe it with `useLogBucket`:

```tsx
import { createLogBucket, useLogBucket } from "./hooks/useLogBucket";

const logs = createLogBucket({ name: "example", maxEntries: 100 });
logs.info("Ready.");
logs.warn("Connection delayed.", "Retry scheduled.");
logs.error("Request failed.", "code: NOT_FOUND");

function Diagnostics() {
  const entries = useLogBucket(logs);
  return <output>{entries.length} entries</output>;
}
```

Each bucket has independent retention and a `clear()` action. The entry limit must be a positive integer and defaults to 100. Global console methods remain unchanged; only explicit bucket calls are retained. Buckets and their logger code live alongside `hooks/useLogBucket/`. Supply text messages and optional text details without application payloads.

## Design system

Run the web Storybook from the repository root:

```bash
bun run ui:storybook
```

Open `http://localhost:6007`. Foundations document color, typography, spacing, and motion. Component stories show supported states and interactive behavior.

Keep reusable visual primitives in `src/design-system/`. Comma Agents components composed from those primitives belong in `src/components/`; complete screens belong in `src/pages/`. `App` initializes and composes the application.

```text
src/
  App/
  design-system/
    Button/
    ConnectionStatus/
    IconButton/
    Input/
    Modal/
    TextArea/
    Foundations/
  components/
    ChatInput/
    ChatPane/
    DaemonConnectionStatus/
    DropZones/
    LogDialog/
    RunSection/
      CodeBlock/
      ContextMeter/
      MarkdownBlock/
      ReasoningBlock/
      ToolBlock/
      ToolGroup/
      useElapsed/
    Sidebar/
    SettingsDialog/
    TitleIcon/
    Workspace/
  pages/
    NewChat/
    RunPage/
  routes/
  hooks/
    useLayout/
    useLogBucket/
      logger/
    useRunState/
    useSettings/
    useWebSocket/
    useCommaAgentsDaemon/
  styles/
```

Colocate a component's SCSS Module, exports, and `{Domain}.storybook.tsx` stories in its folder. Document component props with JSDoc and use Storybook controls for their supported options. Include relevant disabled, focus, keyboard, and responsive states. Interaction stories exercise behavior; accessibility checks help identify issues with labels, contrast, and semantics.

Use shared style tokens rather than repeating literal values. The foundation uses a near-black canvas (`#0B090F`), purple surfaces (`#15111D`, `#1D1728`), lavender accents (`#D0BCFF`), light text (`#E6E1E5`), muted text (`#ABA3B5`), and borders (`#49454F`). Spacing follows a 4px scale, corners use 4px rounding, and chat prose uses system sans-serif while code uses self-hosted Geist Mono with system monospace fallbacks. Other interface text retains Geist Mono.

Icons come from `lucide-react`. Import individual icons and use the IconButton primitive for icon-only actions. It supplies an accessible name and native hover title from its required `label` prop. Geist Mono is bundled through Fontsource and loads locally in both the app and Storybook.

Keep application code browser-compatible and assets relative to the build so a desktop wrapper can be added later. This package does not include an Electron shell.

Controls use compact spacing: buttons are at least 28px tall with 4px vertical and 8px horizontal padding. The generic TextArea renders only the input; supply an accessible name through `aria-label`, `aria-labelledby`, or an external label. ChatInput owns a native textarea directly for composer-specific editing and sizing. The home screen shows the logo and composer without a visible title or field label. Inputs, text areas, and selects keep their normal borders on focus without an outline.

Input and Modal are design-system primitives with colocated stories. Modal accepts an optional `className` on its dialog element for styling overrides; SettingsDialog uses it to set a maximum width of `42rem`. SettingsDialog owns only the modal shell, section navigation, and dismissal. Each section owns its fields, drafts, validation, persistence, actions, and child dialogs. General Settings retains its local draft across section changes; Providers owns its filters and Add Model/Add Providers dialogs. SettingsPanel shares presentation slots without owning section behavior. The `useSettings` provider owns the active settings and browser persistence; active values change only after a successful storage write. No additional dependencies are needed for settings.

Settings use the localStorage key `comma-agents.settings` with this versioned JSON shape:

```json
{
  "version": 1,
  "daemon": {
    "url": "ws://127.0.0.1:7422/ws"
  }
}
```

## Validate and build

Build the shared packages once before package-local checks, and rebuild them after daemon contract changes:

```bash
bun run --cwd packages/core build
bun run --cwd packages/daemon build
```

From `packages/ui`:

```bash
bunx playwright install chromium
bun run format:check
bun run lint
bun run typecheck
bun run test
```

Root UI launch and build commands build core and the daemon protocol first. Package-local commands consume its built declarations and browser bundle.

Formatting uses oxfmt; linting uses oxlint. Run `bun run format` or `bun run lint:fix` to apply fixes. Interaction tests run Storybook stories in Chromium.

The Chromium installation is needed once per development machine, and again after a Playwright update that changes its browser version.

From the repository root:

```bash
bun run ui:build
bun run ui:storybook:build
```

The app build writes `packages/ui/dist`; the static Storybook build writes `packages/ui/storybook-static`. To preview the app build, run `bun run preview` from `packages/ui`.
