import { render } from "ink";
import { runDoctor } from "../doctor";
import { InstallerApp } from "./InstallerApp";
import type { RunInstallerOptions } from "./install.types";

function printDoctorSummary(): void {
  const result = runDoctor();
  console.log(`Doctor status: ${result.status}`);
  for (const check of result.checks) {
    console.log(
      `${check.status.toUpperCase()} ${check.label}: ${check.message}`,
    );
  }
}

export async function runInstaller({
  textOnly = false,
}: RunInstallerOptions = {}): Promise<void> {
  if (textOnly || !process.stdin.isTTY) {
    console.log("CommaAgents CLI is installed.");
    console.log("Run `comma daemon enable` to enable daemon autostart.");
    console.log("Run `comma` to open the TUI.");
    printDoctorSummary();
    return;
  }

  const app = render(<InstallerApp />);
  await app.waitUntilExit();
}
