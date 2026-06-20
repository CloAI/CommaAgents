import { Box, Text, useApp } from "ink";
import SelectInput from "ink-select-input";
import React from "react";
import { buildAutostartPlan, enableAutostart } from "../autostart";
import type { DoctorResult } from "../doctor";
import { runDoctor } from "../doctor";

interface InstallerChoice {
  readonly label: string;
  readonly value: "enable-autostart" | "lazy-start";
}

export interface InstallerAppProps {
  /** Called after the installer completes. */
  readonly onComplete?: (result: DoctorResult) => void;
}

export function InstallerApp({
  onComplete,
}: InstallerAppProps): React.ReactElement {
  const inkApp = useApp();
  const [status, setStatus] = React.useState<string>(
    "Choose daemon startup behavior",
  );
  const [doctorResult, setDoctorResult] = React.useState<
    DoctorResult | undefined
  >();

  const autostartPlan = React.useMemo(() => buildAutostartPlan(), []);
  const choices = React.useMemo<InstallerChoice[]>(
    () => [
      { label: "Enable daemon autostart on login", value: "enable-autostart" },
      { label: "Use lazy start when comma opens the TUI", value: "lazy-start" },
    ],
    [],
  );

  const handleSelect = React.useCallback(
    async (choice: InstallerChoice): Promise<void> => {
      try {
        if (choice.value === "enable-autostart") {
          setStatus(`Installing ${autostartPlan.description}`);
          await enableAutostart();
        } else {
          setStatus("Using lazy daemon startup");
        }
        const result = runDoctor();
        setDoctorResult(result);
        onComplete?.(result);
      } catch (caughtError) {
        setStatus(
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
        );
      } finally {
        setTimeout(() => inkApp.exit(), 100);
      }
    },
    [autostartPlan.description, inkApp, onComplete],
  );

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>CommaAgents installer</Text>
      <Text>Platform: {process.platform}</Text>
      <Text>Autostart: {autostartPlan.description}</Text>
      <Text>{status}</Text>
      {doctorResult === undefined ? (
        <SelectInput items={choices} onSelect={handleSelect} />
      ) : (
        <Box flexDirection="column">
          {doctorResult.checks.map((check) => (
            <Text key={check.id}>
              {check.status.toUpperCase()} {check.label}: {check.message}
            </Text>
          ))}
          <Text>Next: run comma</Text>
        </Box>
      )}
    </Box>
  );
}
