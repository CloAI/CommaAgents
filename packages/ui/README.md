# @comma-agents/ui

Browser interface prototype for Comma Agents, with the animated ASCII logo and a prompt composer. This private workspace package runs from the repository checkout.

Requires Node.js 26 or newer.

## Run

From the repository root:

```bash
pnpm install
pnpm run ui
```

Open the development server URL, normally `http://localhost:5173`.

Enter a prompt and press Enter or select Send to prepare and start a run of the selected strategy; the pane then opens the run, printing each agent's streamed text as plain text. Shift+Enter adds a newline. Sending trims surrounding whitespace and preserves your draft; whitespace-only prompts cannot be sent. The app connects to the configured daemon. In an existing conversation, send another message to continue a finished run, answer a pending question, or steer an active agent. Successful submissions clear the composer; failed submissions retain the draft.

Pending tool questionnaires appear above the composer. Use the previous and next controls (`<< 1/2 >>`) to move between questions while retaining drafts. Questions combine multiline text, single or multiple choices, and labeled sliders. Recommendations are suggestions until accepted. Choose Other to replace one whole question with text, or Skip to decline it. Submit answers sends the complete questionnaire together; separate tool calls remain separate collections. Cancelled or completed requests leave the collection. On reconnect, a fresh snapshot removes requests resolved while disconnected and preserves drafts for requests still pending.

The composer starts at one line and grows with wrapped or pasted text up to three visible lines. Longer prompts scroll inside the field, and removing text shrinks it again. The up-arrow Send action sits inside the bottom-right of the composer. Run pages leave extra space below the composer to keep Send clear of the daemon indicator. When the prompt overflows, a thin, theme-colored scrollbar sits at the far-right edge and Send shifts left to leave room. Without overflow, Send stays at the normal right inset. Sizing adapts to the available width and font loading; manual resizing is disabled.

The logo animates automatically at 16 frames per second without playback controls. A reduced-motion preference shows a static frame.

The sidebar is a 44px icon rail with Create Workspace followed by New Chat at the top, workspace icons beneath them, and Settings at the bottom. Hover or focus an icon to slide out only that action's label. Each workspace shows its chats as smaller status icons in the rail, with shared-pane chats grouped by a rounded tint. Hover or focus a workspace to slide out its name and all of its chat names together. The ellipsis options icon appears beside the expanded workspace name. Other items stay as icons, and the rail and chat panes keep their widths. New Chat opens an empty chat in the focused pane while retaining its previous conversations in the sidebar. Settings opens a modal dialog and leaves your prompt unchanged.

## Workspaces and archives

General holds unorganized work. Creating a workspace from General moves all unarchived chats and their pane arrangement into it, carries the chosen working directory, and resets General to one empty pane. General's archives stay behind.

Creating from a named workspace retains the arrangement and offers fresh chats, copied conversations, or moved conversations. Choose the destination directory explicitly. Copying preserves full context through the last completed response, including delegated conversations, without starting work. Running copies require confirmation, and chats without a completed response are excluded.

Chats appear directly under workspace titles, with no accordion or collapse controls. Fully rounded, translucent tints group chats sharing a pane; custom pane colors provide the tint hue. Ungrouped chats have no group tint. Compact active-chat highlights are equal-width, equal-height circles; expanded active rows remain highlighted across their width. Selecting a chat displays it in its original pane. New Chat keeps the previous chat available; The X on a chat row closes it into the archive and offers Undo. Closing active work asks for confirmation before stopping it. The displayed chat is highlighted across its whole row. The pane header also offers Mark Done and New Chat for idle conversations. Closing a pane retains unfinished chats for reopening.

Use a workspace's menu to Search Archive by chat title or visible conversation text. Restoring a result returns it to its original pane group. The UI automatically archives eligible chats after one week of inactivity when open. Viewing or interacting resets activity. Chats displayed in saved layouts, running chats, and pending questions or permissions are protected.

The left-hand chat icons show X for errors, `?` for unanswered questions, a spinner for running work, and a warning triangle for permission requests. Idle chats use a chat icon; the displayed chat has a subtle highlight. Workspaces needing attention briefly pulse and remain highlighted; hover or focus its workspace icon to find the relevant chat. Pane arrangements and the selected workspace are saved on this client; project membership and archives are shared through the daemon API.

## Hosting the UI in another app

The design system includes a themed `Slider`, exported with `SliderProps` from `@comma-agents/ui`. It uses a numeric `value` and `onValueChange` callback, optional `min`, `max`, and `step` bounds (defaulting to 0, 100, and 1), and native input options including `disabled`, `id`, and `ref`. Supply an accessible name with `aria-label`, `aria-labelledby`, or a linked label. For example, `<Slider aria-label="Opacity" min={15} max={100} value={opacity} onValueChange={setOpacity} />`. Preview its normal, boundary, disabled, and interactive states under **Design System/Slider** in Storybook.

`@comma-agents/ui` exports `App`, `HostProvider` and a few hooks for applications that embed it; `@comma-agents/desktop` is one. Wrap `App` in `HostProvider` with a `HostCapabilities` object to supply the daemon connection (`createSocket`, used instead of the Daemon URL setting) or desktop preferences (`desktopSettings`, shown as switches in General settings). Pass `header` to `App` to show a header above the workspace, and set `--header-height` so the shell subtracts it from the window height. Without a provider the UI behaves as a browser page.

## Panes and routes

The workspace is a resizable grid of chat panes. Each pane has a small header with its title and actions on the right: split vertical (a new pane beside this one), split horizontal (a new pane below), full screen (fills the workspace; press again to restore the grid) and close. With only one pane, full screen and close are hidden. Drag a pane's header onto an edge of another pane to dock it there as a split. Dividers resize panes; panes keep a minimum size and there is no pane-count limit.

In the Electron app, the picture-in-picture action replaces the pane's full-screen action. Select **Move to new window**, or drag a chat header outside its current window, to move that one chat into its own window. Even a single chat can detach. Detached windows support multiple chats and the same split and docking controls as the main window, while the sidebar stays exclusive to the main window. Detaching the last chat leaves an empty main workspace with **New chat**.

Detached windows with a single chat hide the picture-in-picture action. Drag a chat header onto a drop zone in any window to move that chat there. With multiple chats in a detached window, **Move to new window** pops out the selected chat and leaves its siblings in place. An empty workspace accepts the chat directly. Moving between windows preserves the chat's draft, selected strategy, color, reading width, and execution; it does not stop or restart the run. Closing a detached window or pane retains its unfinished chat collections and lets runs continue. Select one of those chats in the sidebar to reopen its pane.

Select **Chat color** in a pane's header to open an anchored color popout and choose its hue. Click outside it, press Escape, or select Done to close it. The pane keeps the main theme's saturation and brightness, including its dark surfaces and light text. The choice is saved in this browser per pane; **Reset to theme** restores the main theme.

Each pane has its own route: `/` is a new chat (strategy and model controls and the composer; the logo hides when the pane is short) and `/runs/<id>` follows a run's output. Starting a run from a new chat opens its route in the same pane. Drafts and strategy choices belong to each chat and are saved across reloads. The address bar shows the focused pane's route as `/#/runs/<id>` and a route in the address bar at launch opens in the focused pane. The grid, each pane's route and the focused pane are saved in the browser and restored on reload; full screen is not saved.

While a model-backed agent is running, select the square **Stop** button beside Send to cancel the run. Stop and its keyboard shortcut are unavailable when only a user-input step is waiting. You can also press **Escape twice within 1.5 seconds** in the active conversation pane, including when focus is on its header or the page body. The first press shows “Press Escape again to stop this chat” above Stop; the hint disappears when the shortcut expires, you type, click, or switch panes. A single Escape, a held key, or Escape used to dismiss a picker or dialog does not stop the run. Stopping keeps your unsent draft and the output received so far.

## Read conversation content

Conversation text uses a system sans-serif font; inline code, code blocks, and tool arguments/output use Geist Mono at the same 1rem size. Headings, lists, and tables retain their hierarchy. Long code lines scroll horizontally. Message cards and the composer share aligned edges, with stable spacing when the conversation begins or stops scrolling.

Consecutive tool calls appear as one collapsed group with progress and failure counts. Expand the group to inspect individual calls and their arguments/output. Your expansion choices stay in place as updates arrive. Running and failed delegated jobs remain visible with an Open action even when the group is collapsed; successfully completed jobs appear inside the expanded group.

## Switching strategies

Use the strategy picker above the chat input to change an existing conversation from Plan to Build, or to any other installed strategy. The selection is saved immediately and appears in every pane following the conversation. Send your next message to start the selected strategy. Earlier user and agent text is available as attributed context; raw tool output is excluded from the handoff. The picker opens above or below its button depending on the available space, stays within the window, and follows the button when panes scroll or resize.

If work is running or waiting for your reply, choose **Stop and switch** to interrupt it and select the replacement, or **Wait** to dismiss the dialog. Wait does not queue a switch. Successful changes appear in the conversation timeline. A failed switch keeps the previous selection and draft; work that was already stopped remains stopped. If the saved strategy is unavailable, choose another before sending.

Strategy and model controls sit in a contrasting capsule above the input inside the composer. While disconnected, “Waiting for daemon…” replaces the strategy picker after 50ms; a connection that opens sooner never shows the notice. Strategy and stop issues appear in a compact yellow capsule attached above the composer. Failed message submissions appear first in the same notice area with a red background and retain the draft. Use the arrows to page through multiple notices, or dismiss them all; a changed set of issues appears again. Retrying a message clears its previous submission error.

Model controls apply to this conversation. Each strategy remembers its own settings, including when you switch back. New conversations use your saved per-strategy preferences as defaults. In **Strategy models**, each role's model selector appears below its name and description. Changes and Reset are staged until you select **Save**; Cancel or closing the dialog discards them. Reset restores the daemon defaults. Selectors fit their contents within the screen.

Expand **Daemon Settings** in General Settings to edit the WebSocket URL. It starts collapsed.

Expand **Strategy model aliases** in General Settings to configure the default models behind role names such as `@medium`. The section starts collapsed.

Expand **Skills** in General Settings to browse skills discovered for the daemon’s working directory and global skill directories. Search names and descriptions with matching text highlighted. Select **View full skill** to read the complete raw Markdown instructions in a scrollable modal; YAML frontmatter is excluded. Viewing a skill does not activate it in a conversation.

Use **Configurations** in Settings to apply an OpenAI balanced or economy template, an Anthropic, xAI Grok, Alibaba Qwen, or DeepSeek template, a GPT OSS template through Groq, or a configuration you saved. OpenAI balanced uses GPT-6 Luna for simple, memory, and compaction roles, GPT-6.1 Terra for medium work, and GPT-6.1 Sol for complex work; economy uses Luna except for complex work. **Save configuration** asks for a name and confirmation before saving or replacing a configuration. **Delete** asks for confirmation and only removes custom configurations. Configurations are saved in this browser; selecting one applies its matching roles to the daemon immediately. The conversation dialog contains only role overrides and applies them when you select Save. Built-in templates require access to the corresponding provider and models.

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

Open Settings and select General Settings to edit the daemon WebSocket URL. Its default is `ws://127.0.0.1:7422/ws`. Appearance offers a theme selector with an inline Light, Dark, and System switch. System follows operating-system appearance changes automatically, and the choice is saved in this browser. You can also customize a copy of a built-in theme. Hub and Privacy are placeholders. The app connects automatically using this URL. Authentication settings are not available yet.

Select Save in General Settings to validate and store the URL. Surrounding whitespace is trimmed. URLs must use `ws:` or `wss:` and include a hostname; custom paths and query strings are allowed, but fragments and embedded credentials are rejected. A successful save shows Saved for three seconds and keeps the dialog open.

Cancel, the close button, or Escape discards unsaved changes. Clicking the backdrop does not dismiss the dialog. Switching sections retains your draft. Reopening Settings selects General Settings and loads the saved value.

Settings are saved in this browser for the current origin. They load once when the app starts; changes from another tab appear after reloading. A missing value uses defaults. Malformed or unsupported stored settings show a notice and use defaults without replacing the stored value until you explicitly save. If storage cannot be written, the draft and previously active settings are retained so you can retry.

Settings and provider forms validate when you save and focus the first invalid field. After an invalid save, editing a field checks its value again.

The settings dialog has a fixed height of 34rem, capped to fit shorter screens. Long sections scroll inside the dialog while navigation and actions remain visible.

## Providers

Open Settings and select Providers to browse the daemon's provider and model catalog. The panel subscribes to the `core.providers.list` channel on the saved daemon connection, so the list updates whenever the daemon rebuilds it. Each provider's models combine models.dev, the provider's own API, and manual entries. Loading and connection failures appear in the panel.

Select **Refresh** beside Add model to call `core.providers.refresh`, which re-downloads models.dev and calls every provider's API. The button shows Refreshing... while the daemon calls provider APIs, including during its startup build. The current list stays visible until the new one arrives.

Search provider names/IDs or model names/IDs/families, search and choose providers in the provider picker, and toggle model capability filters: Tools, Reasoning, Vision, Attachments, Structured output, TEE attestation support, and E2EE support. Both provider and capability selectors support search, multiple selections, and removable pills inside the field. Their lists stay open after selection so you can keep adding choices. Choose All providers or All capabilities to clear that filter. Text matching is case-insensitive. Providers whose name or ID matches the search appear before providers that match only through their models; catalog order is preserved within each group. Multiple capability filters require every selected capability; missing capability metadata does not count as support. Filters combine locally without additional daemon requests. Selecting a model with advertised TEE or E2EE support automatically requires those protections, including strategy overrides. Privacy badges describe provider-reported support; only a successful verification report confirms protection. If verification is unavailable, the request fails without falling back to ordinary inference.

Providers start collapsed, with the matching model count beside each provider name. Expand a provider to see all matching models with their existing name, qualified ID, provider, and capability icons. Pagination is temporarily disabled; its component and commented call site are retained for future use. Search and capability changes return provider sections to their collapsed state. Literal, case-insensitive matches are highlighted in provider names, model names, IDs, and picker options.

Each provider row shows Connected when effective credentials exist or authentication is not required. A successful supported credential check shows Verified for the current provider-settings view. A failed check shows a warning; providers requiring an absent key show Needs credentials. These labels describe configuration or an authenticated model-list check, not a persistent provider connection or guaranteed generation access.

Connect and Configure open one workflow dialog above Settings. Enter a new key and select Save to persist it, and verify automatically where supported; the daemon then updates the list. Existing keys are never returned or prefilled. Environment credentials take precedence over saved global keys. If verification fails, Continue retains the saved configuration or Edit returns to the populated form. Providers without a verification endpoint remain Connected without a check.

For OpenAI, choose **ChatGPT subscription** in the connection dialog, then **Continue with ChatGPT**. Complete authorization in the browser; a fallback link is shown if a new tab is blocked. The browser and daemon must run on the same computer. Sign-in checks identity and plan permission without a test generation; the daemon then updates the list. Tokens stay on the daemon and renew when needed. Environment API keys retain precedence. **Manage ChatGPT usage** opens the account's usage controls. Removing a saved sign-in is local credential removal; remote access can be revoked through those controls. This first version reconnects one saved ChatGPT registration; account switching and Anthropic subscription sign-in are deferred.

Select Add model to choose a provider and enter one provider-local model ID. All metadata is optional: display name, capabilities, token limits, modalities, dates, status, and pricing. Click capability buttons to enable support; unselected capabilities remain unspecified. The selected provider supplies the provider prefix automatically, and pasted redundant provider prefixes are removed. Provider-specific model namespaces are preserved. Advanced metadata is collapsible. Manual metadata fills values missing from models.dev and the provider's API; it does not override known information. Existing manual IDs cannot be added again to silently replace metadata.

Select + Provider to create a custom compatible endpoint with an immutable ID, display name, complete HTTP(S) API prefix, and API-key or unauthenticated mode. The API key is optional and can be configured later. Enter optional initial model IDs one per line; each is saved with a separate command after the provider is created. Duplicate IDs are ignored, and a retry resumes model additions without repeating completed entries. An endpoint saved without its required key remains visible, including when it has no models. If creation succeeds but a later key or model save fails, retry edits the saved provider rather than creating it again.

User-owned endpoint definitions can be edited or removed. Removing one also removes its saved global key and manual models; environment and strategy credentials are unchanged. Custom model removal deletes only the manual entry, so a model from models.dev or the provider's API may remain visible. Manual entries, including duplicates of catalog IDs, can be removed from Configure. Confirmations and failure steps stay inside the same workflow dialog.

Changes update the provider list through the channel while preserving its current search, filters, and expanded rows. Input drafts and errors stay within their workflow. Provider settings and credentials are stored by core on the daemon; the browser stores only its existing UI settings. Search and verification display reset when the provider section is unmounted. Verification is never run in the background, and its results are not kept.

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
pnpm run ui:storybook
```

Open `http://localhost:6007`. Foundations document color, typography, spacing, and motion. Component stories show supported states and interactive behavior.

Use the shared `Accordion` primitive for collapsible sections; it starts collapsed and preserves its contents when closed. `AccordionRender` exposes the expanded state for controlled rendering and Storybook.

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

Use component `Render` exports to preview visual states with props. Hooks do not have Storybook entries.

Colocate a component's SCSS Module, exports, and `{Domain}.storybook.tsx` stories in its folder. Document component props with JSDoc and use Storybook controls for their supported options. Include relevant disabled, focus, keyboard, and responsive states. Interaction stories exercise behavior; accessibility checks help identify issues with labels, contrast, and semantics.

Page-specific subcomponents also need their own stories under the page's Storybook group. RunComposer, RunOutput, and StopControl expose Render components that accept typed state and callbacks and compose their child components directly. Cover their lifecycle, disabled, error, decision, and keyboard states alongside the full-page integration stories.

Use the Storybook Appearance toolbar to preview controls in Light or Dark, or choose App theme when testing appearance settings. The Design System / Focus gallery shows keyboard focus across controls. Dedicated stories cover question collections, subagent dialogs, model-role setup, model removal, catalog components, context usage, and theme editing. Rebuild the static Storybook after adding stories to refresh its navigation.

Use shared style tokens rather than repeating literal values. The foundation uses a near-black canvas (`#0B090F`), purple surfaces (`#15111D`, `#1D1728`), lavender accents (`#D0BCFF`), light text (`#E6E1E5`), muted text (`#ABA3B5`), and borders (`#49454F`). Spacing follows a 4px scale, corners use 4px rounding, and chat prose uses system sans-serif while code uses self-hosted Geist Mono with system monospace fallbacks. Other interface text retains Geist Mono.

Icons come from `lucide-react`. Import individual icons and use the IconButton primitive for icon-only actions. It supplies an accessible name and native hover title from its required `label` prop. Geist Mono is bundled through Fontsource and loads locally in both the app and Storybook.

Keep application code browser-compatible and assets relative to the build so a desktop wrapper can be added later. This package does not include an Electron shell.

Controls use compact spacing: buttons are at least 28px tall with 4px vertical and 8px horizontal padding. The generic TextArea renders only the input; supply an accessible name through `aria-label`, `aria-labelledby`, or an external label. ChatInput owns a native textarea directly for composer-specific editing and sizing. The home screen shows the logo and composer without a visible title or field label. Inputs, text areas, and selects keep their normal borders on focus without an outline. All components suppress outlines on focus. Buttons use background changes for keyboard focus.

The strategy toolbar includes disabled attachment and dictation icon placeholders on the right. Both are marked coming soon.

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
pnpm --dir packages/core build
pnpm --dir packages/daemon build
```

From `packages/ui`:

```bash
bunx playwright install chromium
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
```

Root UI launch and build commands build core and the daemon protocol first. Package-local commands consume its built declarations and browser bundle.

Formatting uses oxfmt; linting uses oxlint. Run `pnpm run format` or `pnpm run lint:fix` to apply fixes. Interaction tests run Storybook stories in Chromium.

The Chromium installation is needed once per development machine, and again after a Playwright update that changes its browser version.

From the repository root:

```bash
pnpm run ui:build
pnpm run ui:storybook:build
```

The app build writes `packages/ui/dist`; the static Storybook build writes `packages/ui/storybook-static`. To preview the app build, run `pnpm run preview` from `packages/ui`.
