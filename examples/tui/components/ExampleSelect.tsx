/**
 * ExampleSelect — pick an example script to run.
 *
 * Displays the examples from the shared definitions as a selectable list.
 */

import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { CORE_EXAMPLES, DAEMON_EXAMPLES } from "../examples";
import type { ProviderSelection } from "./ProviderSelect";

export type { ExampleEntry } from "../examples";

interface ExampleSelectProps {
  provider: ProviderSelection;
  onSelect: (example: import("../examples").ExampleEntry) => void;
  onBack: () => void;
}

export function ExampleSelect({ provider, onSelect, onBack }: ExampleSelectProps) {
  const allItems = [
    ...CORE_EXAMPLES.map((e) => ({
      label: `[core]   ${e.label}`,
      value: e.value,
    })),
    ...DAEMON_EXAMPLES.map((e) => ({
      label: `[daemon] ${e.label}`,
      value: e.value,
    })),
    { label: "\u2190 Back to provider selection", value: "__back__" },
  ];

  const handleSelect = (item: { label: string; value: string }) => {
    if (item.value === "__back__") {
      onBack();
      return;
    }
    const entry =
      CORE_EXAMPLES.find((e) => e.value === item.value) ??
      DAEMON_EXAMPLES.find((e) => e.value === item.value);
    if (entry) {
      onSelect(entry);
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        comma-agents Example Runner
      </Text>
      <Text dimColor>─────────────────────────────</Text>
      <Box marginTop={1}>
        <Text>
          Provider: <Text color="green">{provider.providerID}</Text> | Model:{" "}
          <Text color="green">{provider.model}</Text>
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>Select an example to run:</Text>
        <Box marginTop={1}>
          <SelectInput items={allItems} onSelect={handleSelect} />
        </Box>
      </Box>
    </Box>
  );
}
