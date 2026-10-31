# Dependency patches

## Active: Ink 8.0.0

`ink@8.0.0.patch` adds the synchronous `measureLayout(node, { width, height? })`
API used by `ScrollableView` to measure virtualized rows. Ink 8.0.0 does not
export this API. Its `measureElement` API measures mounted elements and does
not replace detached row measurement.

The patch also exposes a host-config factory so measurement can use a secondary
React reconciler with its own update priority. Keep it until upstream provides
equivalent detached measurement that works during a live commit.

Rebased against the published Ink 8.0.0 tarball on 2026-10-21. The rebase retains
upstream's renderer fixes and supplies the new container callback argument for
React 19.3's reconciler. The accidental `.bun-tag` file from the old patch was
removed.

Verification lives in
`packages/tui/src/components/ScrollableView/measureLayout.test.tsx` and the
scrollable-view integration tests. After changing the patch, run `bun install`
and those tests. Keep Ink and React versions aligned across terminal workspace
packages so their components and test renderer share a React instance.

## Archived

`archive/ink@7.0.1.patch` is preserved unchanged for reference. It is superseded
by the Ink 8.0.0 patch; the custom measurement API has not been solved upstream.
Only the active patch is registered in the root `patchedDependencies` map.

## Upgrade scope

The TUI runtime dependencies were checked against npm's stable `latest` tags on
2026-10-21. Packages already at their latest release were kept. TypeScript stays
at 6.0.2 to match the repository's shared compiler and declaration build; moving
the workspace to TypeScript 7 is a separate compiler migration.

Upstream reference: [Ink 8.0.0 release notes](https://github.com/vadimdemedes/ink/releases/tag/v8.0.0).
