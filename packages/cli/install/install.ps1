$ErrorActionPreference = "Stop"

$Repository = "CloAI/CommaAgents"
$Version = if ($env:COMMA_VERSION) { $env:COMMA_VERSION.TrimStart("v") } else { "2.0.0-rc.0" }
$InstallDir = if ($env:COMMA_INSTALL_DIR) {
  $env:COMMA_INSTALL_DIR
} else {
  Join-Path $env:LOCALAPPDATA "Programs\CommaAgents\bin"
}

$Architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
$Arch = if ($Architecture -eq "arm64") { "arm64" } else { "x64" }
$Asset = "comma-windows-$Arch.zip"
$BaseUrl = "https://github.com/$Repository/releases/download/v$Version"
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $TempDir | Out-Null

try {
  $Archive = Join-Path $TempDir $Asset
  $Checksums = Join-Path $TempDir "SHA256SUMS"
  Invoke-WebRequest -Uri "$BaseUrl/$Asset" -OutFile $Archive
  Invoke-WebRequest -Uri "$BaseUrl/SHA256SUMS" -OutFile $Checksums

  $ChecksumLine = Get-Content $Checksums | Where-Object { $_ -match "\s+$([regex]::Escape($Asset))$" } | Select-Object -First 1
  if (-not $ChecksumLine) { throw "No checksum was published for $Asset." }
  $Expected = ($ChecksumLine -split "\s+")[0].ToLowerInvariant()
  $Actual = (Get-FileHash -Algorithm SHA256 $Archive).Hash.ToLowerInvariant()
  if ($Expected -ne $Actual) { throw "Checksum verification failed for $Asset." }

  Expand-Archive -Path $Archive -DestinationPath $TempDir
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  $TemporaryExecutable = Join-Path $InstallDir "comma.new.exe"
  Copy-Item (Join-Path $TempDir "comma.exe") $TemporaryExecutable -Force
  Move-Item $TemporaryExecutable (Join-Path $InstallDir "comma.exe") -Force

  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $PathEntries = @($UserPath -split ";" | Where-Object { $_ })
  if ($InstallDir -notin $PathEntries) {
    [Environment]::SetEnvironmentVariable("Path", (@($InstallDir) + $PathEntries) -join ";", "User")
  }
  $env:Path = "$InstallDir;$env:Path"
  & (Join-Path $InstallDir "comma.exe") install
} finally {
  Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
}
