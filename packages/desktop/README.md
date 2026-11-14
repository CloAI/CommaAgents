# @comma-agents/desktop

Electron app that hosts the Comma Agents UI (`@comma-agents/ui`) with a custom window header. This private workspace package runs from the repository checkout.

The daemon runs inside the app's main process and talks to the window over Electron IPC. There is no WebSocket server and no listening port, and the renderer's content security policy allows no network access.

Requires Node 26 and pnpm, like the rest of the repository.

## Run

From the repository root:

```bash
pnpm install
pnpm desktop
```

The development and build commands install Electron's executable if it is missing. The first run needs network access to download it; later runs reuse the installed executable.

If an older checkout stops with `Electron uninstall`, run `pnpm --dir packages/desktop exec install-electron`, then start again. `pnpm rebuild electron` does not download the executable for Electron versions that have no install hook. If the download fails, check access to GitHub release downloads and retry the install command.

`pnpm desktop:build` produces an unpacked app for your platform in `packages/desktop/dist`. It is unsigned and has no installer.

## Behavior

- **Header.** The window has no system frame; a bar above the workspace shows the focused pane's title, drags the window, and holds its own minimize, maximize/restore and close buttons. They sit at the right on Windows and Linux, and as round dots at the left on macOS.
- **Pin and opacity.** Use the pin button on the right of the header to keep that window on top. On macOS, pinned windows also appear across Spaces, including above fullscreen apps. Unpinning restores normal window stacking and workspace visibility. Pinning does not take focus from another app. Click the opacity button to slide out a range control from 15% to 100%; changes apply to the entire window immediately. Click again, move focus outside the controls, or press Escape to collapse it. Each main or detached window has independent settings, retained while hidden but reset when the window is recreated.
- **Daemon.** Starts with the app and stops when it quits. If a standalone daemon (`comma daemon`) is already running, the app does not start its own and the connection indicator shows why. Stop the standalone daemon, or use the web UI. A standalone daemon started after the app is not detected, so both can write the same runs directory.
- **Settings.** In General settings the Daemon URL field is hidden (the app always uses its own daemon), and two desktop switches appear: **Keep running in background** and **Start on login**.
- **Background.** With Keep running in background on, closing the main window hides all chat windows to the tray; the daemon and its runs keep going. The tray menu shows or hides all windows together, reports the daemon and how many runs are active, and has **Quit**, which stops the daemon and every run. With the setting off, closing the window quits. It defaults to on for macOS and Windows and off for Linux (see the Linux note below). Questions and permission requests highlight their workspace and chat in the sidebar. There are no operating-system notifications while the application is hidden.
- **Quitting.** Quitting (tray Quit, Cmd/Ctrl+Q, or closing the window with Keep running off) asks for confirmation when runs are active, and quits at once otherwise. System shutdown and logout skip the question.
- **Start on login.** Registers the app to start hidden in the tray. It is available on macOS and Windows in packaged builds only; on Linux and in development the switch is disabled.
- **Linux.** Tray support is minimal. GNOME hides tray icons without an AppIndicator extension, so background mode defaults to off, and Start on login is unavailable. This needs a proper review (see the `TODO(linux)` in `src/main/desktop-settings.ts`).
- **Links.** `http(s)` links open in your default browser; the app never navigates away from its own page.
- **Windows.** One app instance at a time, with one main window and any number of detached chat windows. Every window supports multiple chats and splits; the main window alone has the sidebar. Use a chat's picture-in-picture action or drag its header outside its current window to detach it. Detached windows with a single chat hide the picture-in-picture action; drag the chat header onto a drop zone in any window to move it there. With multiple chats, the picture-in-picture action pops out one chat and leaves the others in place. There is no pane-count limit.
- **Detached close.** Closing a detached pane or window removes it from the visible arrangement and retains its unfinished chat collections in the workspace sidebar. Runs continue working. Reopen a chat from the sidebar to restore its pane. Use Stop in the conversation to cancel work, or Quit to stop the application.
- **Restoration.** Main placement and preferences are saved in `desktop.json`; chat layouts, strategies, and detached placements are saved in `workspace.json` in the Comma data directory (`~/.comma`, or `COMMA_AGENTS_DATA_DIRECTORY`). Drafts and chat appearance are also retained. Restarting restores open detached windows and adjusts off-screen positions when displays change. It does not start runs automatically. Closed unfinished pane collections remain available to reopen. Switching workspaces hides detached windows from the previous project and restores windows belonging to the selected project. Closing the main window in background mode hides all windows; restoring from the tray shows the selected workspace.

The tray icon is a placeholder (`assets/tray.png` and `assets/tray@2x.png`, 16 and 32 px, rasterized from a Storybook favicon). Replace those two files with the real icon.


## Project workspaces

General is the starting workspace for unorganized work. Create a named workspace to move all its unarchived chats and their pane arrangement into a project. General then starts with one empty chat; its archived conversations stay in General.

When creating from a named workspace, choose the directory and start fresh, copy selected conversations, or move them. The native Browse button chooses a local directory. Copies preserve the conversation through its last completed response and do not start work automatically. Copying a running chat requires confirmation; chats with no completed response cannot be copied yet.

Chats sharing a pane appear together in the sidebar, shaded to match any pane color override. Selecting a chat loads it in that pane. New Chat retains the previous conversation; Mark Done and New Chat archives it with Undo. Search Archive in a workspace's menu finds archived titles and conversation text.

The UI archives eligible conversations after one week without viewing or interaction. Saved displayed chats, running work, and chats awaiting an answer or permission are protected. The rule runs when the UI opens and while it remains open; it does not delete conversation data.

## Layout

```text
src/main/       Electron main process: lifecycle, window, daemon runtime, IPC
src/preload/    The only bridge the renderer sees (window.commaDesktop)
src/renderer/   Header and the IPC socket the UI connects through
src/shared/     IPC channel names and payload types
```

Development runs from source: the UI, the daemon and core are all loaded from their `src/` folders, so no package needs building and edits reload (main-process changes restart the app). Building is for release only. The main process bundles the daemon and core, which also keeps the daemon's WebSocket server and its native `uWebSockets.js` addon out of Electron. Core's built-in strategies are copied next to the bundle at build time.

Known gap for packaging: the language-server integration resolves `typescript` at runtime, which a packaged app does not yet ship.

The title bar shows `CommaAgents v{version}`, followed by the focused run’s strategy name when viewing a run. Right-click text fields for native editing actions and spelling suggestions, or selected text to copy it. Right-click web links to open them in your browser.
