# @comma-agents/cli

Unified CommaAgents installer, terminal interface, and daemon manager.

```bash
bun add --global @comma-agents/cli@next
comma
```

Requires Bun 1.3 or newer. The standalone installer does not require Bun:

```bash
curl -fsSL https://commaagents.com/install | bash
```

Remove the CLI and choose which local data to retain:

```bash
comma uninstall
```

Check for and install the newest compatible release:

```bash
comma update
```

Launching `comma` also checks periodically and offers to install an available
release before opening the terminal interface.
