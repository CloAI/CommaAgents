import { Box, Text, useApp } from "ink";
import SelectInput from "ink-select-input";
import type React from "react";

import type { UpdateCheckResult } from "./update.types";

interface UpdateChoice {
  readonly label: string;
  readonly value: boolean;
}

export interface UpdatePromptAppProps {
  /** Available release to present. */
  readonly update: Extract<UpdateCheckResult, { status: "available" }>;
  /** Called with the user's update decision. */
  readonly onDecision: (accepted: boolean) => void;
}

export function UpdatePromptApp({
  update,
  onDecision,
}: UpdatePromptAppProps): React.ReactElement {
  const inkApp = useApp();
  const choices: readonly UpdateChoice[] = [
    {
      label: `Download and install v${update.release.version}`,
      value: true,
    },
    { label: "Continue without updating", value: false },
  ];

  const handleSelect = (choice: UpdateChoice): void => {
    onDecision(choice.value);
    inkApp.exit();
  };

  return (
    <UpdatePromptAppRender
      currentVersion={update.currentVersion}
      latestVersion={update.release.version}
      choices={choices}
      onSelect={handleSelect}
    />
  );
}

export interface UpdatePromptAppRenderProps {
  /** Currently installed CLI version. */
  readonly currentVersion: string;
  /** Newest available CLI version. */
  readonly latestVersion: string;
  /** Decisions shown in the prompt. */
  readonly choices: readonly UpdateChoice[];
  /** Called when a decision is selected. */
  readonly onSelect: (choice: UpdateChoice) => void;
}

export function UpdatePromptAppRender({
  currentVersion,
  latestVersion,
  choices,
  onSelect,
}: UpdatePromptAppRenderProps): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>CommaAgents update available</Text>
      <Text>
        v{currentVersion} → v{latestVersion}
      </Text>
      <SelectInput items={[...choices]} onSelect={onSelect} />
    </Box>
  );
}
