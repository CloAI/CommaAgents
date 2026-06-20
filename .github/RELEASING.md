# Publishing CommaAgents

The public packages share one version and are published in dependency order:

1. `@comma-agents/core`
2. `@comma-agents/daemon`
3. `@comma-agents/tui`
4. `@comma-agents/cli`

`@comma-agents/utils` remains private and is bundled where needed.

## First Publication

npm trusted publishing cannot create a new package. For `2.0.0-rc.0`:

1. Create a GitHub environment named `npm-bootstrap` and require reviewer approval.
2. Add a short-lived npm automation token as the environment secret `NPM_TOKEN`.
3. Run **Bootstrap npm packages** with version `2.0.0-rc.0`.
4. Configure each npm package's trusted publisher for this repository and `.github/workflows/release.yml`.
5. Delete `NPM_TOKEN` after trusted publishing is configured.

The bootstrap workflow skips packages that already exist at the requested version, so a partially completed run can be retried. It does not request npm provenance while the source repository is private.

## Tagged Releases

Update the root and all four public package versions together, merge to `main`, then push the matching tag:

```bash
git tag v2.0.0-rc.0
git push origin v2.0.0-rc.0
```

Create a protected GitHub environment named `npm-release` and require reviewer approval. Configure the same environment name on each npm trusted publisher.

The **Publish release** workflow validates the version, publishes missing npm versions with OIDC, builds standalone executables, generates `SHA256SUMS`, and creates a prerelease when the version contains a prerelease suffix. Public releases also receive npm provenance and GitHub artifact attestations.

## Repository Security

Before making the repository public:

1. Enable secret scanning and push protection.
2. Enable CodeQL default setup for JavaScript and TypeScript.
3. Enable the dependency graph, Dependabot alerts, and security updates.
4. Enable immutable releases.
5. Protect `main` and release tags with a repository ruleset that requires pull requests and passing checks.

The **Security checks** workflow scans full Git history and built package artifacts with a checksum-verified Gitleaks binary, audits production dependencies, and reviews vulnerable dependencies added by public pull requests.

## Installer Domain

The docs app redirects these stable URLs to the tracked bootstrap scripts:

- `https://commaagents.com/install`
- `https://commaagents.com/install.ps1`

The installer defaults to the exact RC version. Override it for release testing with `COMMA_VERSION`.
