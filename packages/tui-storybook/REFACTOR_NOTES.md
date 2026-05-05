# Refactor Notes — TUI Storybook Setup

Captured during the initial Storybook scaffolding pass. Each item is a
follow-up that should be addressed in a focused PR — they are out of scope
for the playground bring-up but worth tracking.

## Components missing a `*Render` variant

The `react-practices` skill calls for every visual component to be split
into a stateful container and a pure `*Render` presentational component.
The following components do not yet expose a `*Render` and should be
refactored for testability and Storybook ergonomics:

| Component         | Notes                                                                       |
|-------------------|-----------------------------------------------------------------------------|
| `Hide`            | Utility wrapper that gates children on terminal width — arguably exempt.    |
| `MeasuredBox`     | Render-prop wrapper around Ink's measurement primitives — likely exempt.    |
| `MouseProvider`   | Provider, not a visual component — exempt.                                  |
| `MessageList`     | Container that dispatches to per-role renderers; could expose a `*Render` that takes a precomputed `(role, props)[]` for snapshot tests. |
| `PermissionPrompt`| Stateful (focus/keybinding handling); pure rendering of the four-button row + summary block could live in `PermissionPromptRender`. |
| `ScrollableList`  | Selection + scroll state; presentational layer should accept `selectedIndex` + `viewport` props. |
| `ScrollableView`  | Scroll offset + measurement; `*Render` would take precomputed `rowOffset`, `viewportRows`. |
| `StatusBar`       | Already mostly presentational — split into `StatusBarRender` and remove inline `StatusBarProps` (currently not exported). |
| `StrategyPicker`  | Trivial wrapper around `ink-select-input`; expose `StrategyPickerRender` taking the mapped items. |
| `TextAreaInput`   | Owns cursor + scroll state; `TextAreaInputRender` would take wrapped lines + cursor coords. |
| `TitleIcon`       | Owns animation tick state; `TitleIconRender` would take the current frame. |

## Other follow-ups

### `CommandPalette` story dropped

`CommandPalette` statically imports `BUILT_IN_COMMANDS` from
`CommandPalette.constants.ts`, which references the daemon-coupled
`ListProvidersPage`. That page uses `useDaemon` → `@comma-agents/daemon` →
`@comma-agents/core` (which uses `node:fs/promises`, `node:child_process`,
etc.), and `vite-plugin-node-polyfills` chokes on `fs/promises` even with
`protocolImports: true`.

To enable a story for `CommandPalette`, the cleanest fix is to lazy-load
the page references in `BUILT_IN_COMMANDS`:

```ts
// CommandPalette.constants.ts
import { lazy } from "react";

export const BUILT_IN_COMMANDS: readonly Command[] = [
  {
    id: "list-providers",
    label: "list providers",
    description: "Show registered providers and their models",
    keywords: ["providers", "models", "auth"],
    page: lazy(() => import("./pages/ListProvidersPage")),
  },
  // ...
];
```

That breaks the static import chain and lets Vite tree-shake the daemon
deps when the story renders without the `list-providers` command.

### `StatusBarProps` not exported

`StatusBar.tsx` declares its props interface inline and doesn't re-export
it from `StatusBar/index.ts`. The story currently mirrors the shape via a
local `StatusBarStoryArgs` interface. Exporting `StatusBarProps` would
remove the duplication.

### `ChatTextArea.types.ts` JSDoc drift

`ChatTextAreaProps.height` says "@default 10" but the implementation
defaults to `5`. Fix the JSDoc (or the default) to match.

### Storybook ↔ tui import path

The Storybook bridge component imports providers via deep relative paths
(`../../tui/src/...`) because `@comma-agents/tui/package.json` declares a
`main` of `src/index.tsx`, which doesn't actually exist. Either:

1. Create a real `packages/tui/src/index.tsx` barrel and update consumers
   to import from `@comma-agents/tui`, or
2. Configure subpath exports under `package.json#exports` so the deep
   imports become stable public surface.
