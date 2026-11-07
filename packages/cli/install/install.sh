#!/usr/bin/env bash
set -euo pipefail

VERSION="${COMMA_VERSION:-next}"
VERSION="${VERSION#v}"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 26 or newer is required. Install Node.js, then run this installer again." >&2
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 26 ? 0 : 1)'; then
  echo "Node.js 26 or newer is required; found $(node --version)." >&2
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install it with: npm install --global pnpm@10.30.0" >&2
  exit 1
fi
pnpm add --global "@comma-agents/cli@$VERSION"
comma install
