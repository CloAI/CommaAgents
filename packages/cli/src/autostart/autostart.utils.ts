import { homedir } from "node:os";
import { join } from "node:path";

export function resolveCommaPath(commaPath?: string): string {
  if (commaPath !== undefined) {
    return commaPath;
  }
  if (process.env.COMMA_STANDALONE_BUILD === "1") {
    return process.execPath;
  }
  return process.argv[1] ?? "comma";
}

export function resolveHomeDir(homeDir?: string): string {
  return homeDir ?? homedir();
}

export function quoteWindowsCommand(path: string): string {
  return `"${path.replaceAll('"', '\\"')}" daemon start --foreground`;
}

export function buildLaunchdPlist(commaPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.comma-agents.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${commaPath}</string>
    <string>daemon</string>
    <string>start</string>
    <string>--foreground</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
`;
}

export function buildSystemdUnit(commaPath: string): string {
  return `[Unit]
Description=CommaAgents daemon

[Service]
ExecStart=${commaPath} daemon start --foreground
Restart=on-failure

[Install]
WantedBy=default.target
`;
}

export function buildLaunchdPath(homeDir?: string): string {
  return join(
    resolveHomeDir(homeDir),
    "Library",
    "LaunchAgents",
    "com.comma-agents.daemon.plist",
  );
}

export function buildSystemdPath(
  homeDir?: string,
  xdgConfigHome?: string,
): string {
  return join(
    xdgConfigHome ?? join(resolveHomeDir(homeDir), ".config"),
    "systemd",
    "user",
    "comma-agents.service",
  );
}
