/**
 * ExampleSelect — pick an example script to run.
 *
 * Displays the examples from the shared definitions as a selectable list.
 */

import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import { CORE_EXAMPLES, DAEMON_EXAMPLES, E2E_EXAMPLES } from "../examples";
import { useTerminalSize } from "../hooks/useTerminalSize";
import type { ProviderSelection } from "./ProviderSelect";

export type { ExampleEntry } from "../examples";

interface ExampleSelectProps {
  provider: ProviderSelection;
  onSelect: (example: import("../examples").ExampleEntry) => void;
  onRunAll: () => void;
  onBack: () => void;
}

export function ExampleSelect({ provider, onSelect, onRunAll, onBack }: ExampleSelectProps) {
  const { rows } = useTerminalSize();
  const allItems = [
    { label: "\u25b6 Run All Examples", value: "__run_all__" },
    ...CORE_EXAMPLES.map((exampleEntry) => ({
      label: `[core]   ${exampleEntry.label}`,
      value: exampleEntry.value,
    })),
    ...DAEMON_EXAMPLES.map((exampleEntry) => ({
      label: `[daemon] ${exampleEntry.label}`,
      value: exampleEntry.value,
    })),
    ...E2E_EXAMPLES.map((exampleEntry) => ({
      label: `[e2e]    ${exampleEntry.label}`,
      value: exampleEntry.value,
    })),
    { label: "\u2190 Back to provider selection", value: "__back__" },
  ];

  const handleSelect = (item: { label: string; value: string }) => {
    if (item.value === "__back__") {
      onBack();
      return;
    }
    if (item.value === "__run_all__") {
      onRunAll();
      return;
    }
    const entry =
      CORE_EXAMPLES.find((exampleEntry) => exampleEntry.value === item.value) ??
      DAEMON_EXAMPLES.find((exampleEntry) => exampleEntry.value === item.value) ??
      E2E_EXAMPLES.find((exampleEntry) => exampleEntry.value === item.value);
    if (entry) {
      onSelect(entry);
    }
  };

  return (
    <Box flexDirection="column" height={rows}>
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
