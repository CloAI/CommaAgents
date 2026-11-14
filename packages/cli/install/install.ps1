$ErrorActionPreference = "Stop"
$version = if ($env:COMMA_VERSION) { $env:COMMA_VERSION -replace '^v', '' } else { "next" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 26 or newer is required. Install Node.js, then run this installer again."
}
& node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 26 ? 0 : 1)'
if ($LASTEXITCODE -ne 0) {
  throw "Node.js 26 or newer is required; found $(& node --version)."
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw "pnpm is required. Install it with: npm install --global pnpm@10.30.0"
}
& pnpm add --global "@comma-agents/cli@$version"
if ($LASTEXITCODE -ne 0) { throw "CLI package installation failed." }
& comma install
if ($LASTEXITCODE -ne 0) { throw "CommaAgents setup failed." }
