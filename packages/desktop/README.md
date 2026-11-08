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

If it stops with `Electron uninstall`, pnpm skipped Electron's binary download (it only runs install scripts for packages listed in `pnpm-workspace.yaml`). Run `pnpm rebuild electron`, or `node packages/desktop/node_modules/electron/install.js`, then start again.

`pnpm desktop:build` produces an unpacked app for your platform in `packages/desktop/dist`. It is unsigned and has no installer.

## Behavior

- **Header.** The window has no system frame; a bar above the workspace shows the focused pane's title, drags the window, and holds its own minimize, maximize/restore and close buttons. They sit at the right on Windows and Linux, and as round dots at the left on macOS.
- **Daemon.** Starts with the app and stops when it quits. If a standalone daemon (`comma daemon`) is already running, the app does not start its own and the connection indicator shows why. Stop the standalone daemon, or use the web UI. A standalone daemon started after the app is not detected, so both can write the same runs directory.
- **Settings.** The Daemon URL field is hidden: the app always uses its own daemon.
- **Links.** `http(s)` links open in your default browser; the app never navigates away from its own page.
- **Window.** One instance at a time. Size, position and maximized state are saved in `desktop.json` in the Comma data directory (`~/.comma`, or `COMMA_AGENTS_DATA_DIRECTORY`) and restored on launch.

## Layout

```text
src/main/       Electron main process: lifecycle, window, daemon runtime, IPC
src/preload/    The only bridge the renderer sees (window.commaDesktop)
src/renderer/   Header and the IPC socket the UI connects through
src/shared/     IPC channel names and payload types
```

Development runs from source: the UI, the daemon and core are all loaded from their `src/` folders, so no package needs building and edits reload (main-process changes restart the app). Building is for release only. The main process bundles the daemon and core, which also keeps the daemon's WebSocket server and its native `uWebSockets.js` addon out of Electron. Core's built-in strategies are copied next to the bundle at build time.

Known gap for packaging: the language-server integration resolves `typescript` at runtime, which a packaged app does not yet ship.
