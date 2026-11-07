# Node 26 migration implementation audit

## Isolation and scope

- Original checkout: `/Users/sync/VPS/CloAI/CommaAgents2`, branch `feature/clean-up-daemon-services`, original HEAD `2ce9225`.
- Frozen baseline: `/Users/sync/VPS/CloAI/CommaAgents2-bun-baseline`, snapshot `4a41089`.
- Migration: `/Users/sync/VPS/CloAI/CommaAgents2-node26`, branch `migration/node26-uws`.
- The snapshot includes pre-existing tracked and untracked work. Migration statistics compare against that snapshot, excluding the user's original changes. The migration was merged into the original checkout on `feature/clean-up-daemon-services` in commit `13cb57f`. The existing work is preserved in checkpoint `4a41089`; pre-merge backup branch `backup/pre-node26-merge` remains available. No publication has occurred.

Runtime: Node 26.13.0. Package management/provider installation: pnpm 10.30.0. Build: Rolldown 1.3.0 with built-in Oxc transforms/minification and TypeScript declarations/checks. Tests: Vitest 3.2.7. User TypeScript loading: tsx 4.23.15. Transport: uWebSockets.js tag v20.70.0.

Electron integration, cross-platform validation, and replacement standalone executable packaging are deferred. The Unix and PowerShell bootstrap scripts now install the Node CLI package using pnpm rather than downloading Bun executables; Node 26 and pnpm must already be installed.

## Confirmed decisions and implementation

```text
pnpm-workspace.yaml                            [NEW] workspace, canonical lock, Ink patch
package.json + package manifests               [MODIFY] Node engines, pnpm commands/dependencies
pnpm-lock.yaml                                 [MODIFY] canonical workspace lock
Bun configs + lockfiles                        [REMOVE] migrated branch only
vitest.config.ts                               [NEW] Node projects, aliases, snapshot policy
scripts/build-public-package.ts                [MODIFY] Rolldown, chunks, exports/assets/declarations
packages/core/src/
  glob/glob.ts                                 [NEW] approved picomatch compatibility matcher
  glob/glob.fixtures.json                       [NEW] Bun-captured matching fixtures
  glob/glob.test.ts                             [NEW] parity checks
  guard/policies.test.ts                        [MODIFY] root/dotfile policy regressions
  strategy/loader/project-loader.ts             [MODIFY] tsx ESM loading and clear CJS rejection
  strategy/loader/project-loader.test.ts        [MODIFY] native published-module registry proofs
  other Bun-dependent runtime modules           [MODIFY] Node fs/crypto/zlib/process APIs
packages/daemon/src/
  daemon-server/daemon-server.ts                [MODIFY] current uWS listener
  daemon-server/transport/                      [NEW] shared limits, guarded send/close
  server/createDaemon.ts + protocol dispatcher [MODIFY] legacy uWS listener and send handling
  daemon-cli/ + cli.ts                          [MODIFY] Node launch and lifecycle compatibility
packages/cli/
  src/                                         [MODIFY] Node launch/process/doctor paths
  scripts/                                     [MODIFY] Node package build; standalone build disabled
  install/                                     [MODIFY] Node/pnpm package bootstrap
packages/tui/                                  [MODIFY] Node build/test/runtime packaging
existing tests + snapshots                     [MODIFY] Vitest APIs/fixtures and key translation
existing CI, docs, examples, eval harness       [MODIFY] Node/pnpm execution and ESM requirements
benchmarks/runtime/                            [NEW] deterministic runner, raw results, comparison
```

Existing public daemon factories and wire/persistence schemas remain. The independent server still leaves its kernel running when stopped. Binary/malformed current-protocol requests retain code 1008; server shutdown uses 1001. Explicit limits are 16 MiB payload/buffer, 120-second idle timeout, automatic pings, compression disabled. The approved overload behavior checks capacity before sending and disconnects with 1013, preserving room for the close frame and awaiting subscription cleanup.

Executable project entries/tools/flows must use `.mts`/`.mjs`, or `.ts`/`.tsx`/`.js`/`.jsx` under the nearest `package.json` with `"type":"module"`. CommonJS formats produce conversion guidance. Declarative JSON/YAML strategy and agent data is unaffected. No new persistent application schema/state was introduced.

The approved picomatch 4.0.7 matcher preserves Bun's dotfiles, whole-pattern negation, root/empty/special segments, and trailing slash behavior. Captured fixtures cover 46 patterns across 44 paths; an additional 90-pattern differential check found no mismatches in its 23 tested paths. This is tested compatibility coverage, not a proof for every possible glob expression.

## Validation and remaining baseline failures

Post-merge checks in the original checkout passed under Node 26.13.0 and pnpm 10.30.0: frozen installation, full root build/four-package validation, CLI and TUI help/startup, core/daemon production typechecks, and all 149 focused migration tests across 14 files. The original checkout's local VS Code launch configuration was carried over; `.vscode/` remains ignored.

- Frozen pnpm installation: passed.
- All four public builds and package validation: passed.
- Core/daemon production declaration-project typechecks with `noCheck:false`: passed.
- Focused migration suite: 149 tests passed.
- ESM project loading: 20 tests passed, including native built-package enum/JSX/shared-registry proofs.
- Glob and guard parity: 51 tests passed.
- Real current/legacy transport, dispatcher, and subscription checks: 53 tests passed, including overload close 1013, retry after occupied port, restart, invalid frames, and cleanup.
- CLI/TUI workspace startup/help: passed. The merged checkout also includes `.nvmrc` selecting Node 26 and the local Node/pnpm VS Code launch configuration.
- Packed consumer daemon: native uWS + real status command + independent listener stop passed.
- Packed consumer CLI/TUI: fresh pnpm installation without inherited workspace patches passed both native CLI and TUI help checks. The shipped TUI chunk embeds patched Ink and its three Ink component packages; React, Yoga/WASM, and react-reconciler stay external. A temporary copy of the actual installed chunk exposed its private renderer only for verification and produced the expected 20 x 2 layout, then was removed. Yoga 3.2.1 and react-reconciler 0.34.0 are direct dependencies; the bundled Ink license is retained.
- Lint: 1,159 diagnostics versus 1,160 on the frozen baseline, with zero new diagnostics.
- Snapshot migration preserves all 17 snapshot files' expected values byte-for-byte except the approved Node-neutral tool-description wording. Only runner keys/headers change. CI validation prevents silent snapshot creation.

The full CI-style Node suite reported 2,682 passing, 107 failing, and 6 skipped tests across 260 files. One migration failure was a temporary executable-project fixture lacking the newly approved ESM metadata; it was fixed and all seven tests in that file passed on rerun. The remaining 106 failing cases involve existing removed exports/stale expectations and the five preserved Modal snapshots. The Bun baseline reported 2,523 passing, 11 failing, and 3 errors across 244 files: counts are not directly comparable because Bun aborts some files on missing named exports while Vitest enumerates their tests, and the Node root suite also includes E2E tests. Legacy E2E files also fail to import on the baseline because of a missing `sleep` export, so complete behavioral equivalence for those stale scenarios remains unverified.

Ordinary core/daemon typechecks remain red on existing test code: missing `ok` in a ToolResult fixture and references to removed `createConversationRecord`, `resetFlowRegistry`, and `getDaemonDefaults` exports. Production checks pass. The UI build fails on existing broken relative imports; docs prerendering fails on a stale `daemon-store.types.ts` reference. These unrelated defects were preserved.

Local logs and package tarballs are retained in `/Users/sync/VPS/CloAI/comma-node-migration-audit`. Performance results and reproduction commands are in [COMPARISON.md](./COMPARISON.md), with raw samples under `results/`.

## Change size and complexity

Production source audit: 54 existing files changed and 4 new files; 1222 lines added, 1002 removed, net +220. This excludes tests, configs/build tooling, manifests/locks, generated data, examples, and the original user's changes. Detailed file counts are in `results/production-diff.json`.

New internal policy code is limited to glob compilation, executable-module ESM validation, and shared bounded WebSocket sends/closes. Existing kernel/plugin/subscription ownership remains. The approved TUI renderer bundling is confined to build configuration; the public TUI API still exposes only runTui and its types. There is no new transport queue, replay protocol, runtime adapter framework, or persistent manager. New direct production dependencies are uWebSockets.js, tsx, and picomatch; CLI core/daemon/TUI, Ink, React, and yargs move to normal runtime dependencies under the approved package split; the approved renderer packaging also adds existing transitive dependencies yoga-layout 3.2.1 and react-reconciler 0.34.0 directly to TUI. Development dependencies add Rolldown, Vitest/coverage, and Node/picomatch types while removing Bun types.

The main maintenance tradeoffs are a pinned glob compatibility shim over picomatch-generated regexes, tsx loader registration, native uWS version/platform compatibility, and release handling for the existing Ink patch. Tests protect the first three on this Mac. Electron ABI/signing, Windows command launch behavior, and other platforms are unverified. Full suite and UI/docs baseline failures should be resolved before treating the branch as release-ready.
