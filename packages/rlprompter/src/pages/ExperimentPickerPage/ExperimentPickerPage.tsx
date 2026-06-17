import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { SelectItem } from "../../components";
import { Header, SelectList, TextField } from "../../components";
import { useExperiment } from "../../hooks/useExperiment";
import { useTheme } from "../../theme";

type Mode = "list" | "create";

const CREATE_VALUE = "__create__";

/** Landing page: pick an existing experiment or create a new one. */
export function ExperimentPickerPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { exit } = useApp();
  const { experiments, refresh, openExperiment, createExperiment } =
    useExperiment();

  const [mode, setMode] = useState<Mode>("list");

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useInput((input, key) => {
    if (mode === "list" && (key.escape || input === "q")) exit();
    if (mode === "list" && input === "n") setMode("create");
  });

  const items: ReadonlyArray<SelectItem<string>> = [
    ...experiments.map((experiment) => ({
      label: experiment.name,
      value: experiment.id,
      hint: `${experiment.iterationCount} iter · ${experiment.strategyPath}`,
    })),
    { label: "＋ New experiment", value: CREATE_VALUE, hint: "(n)" },
  ];

  async function handleSelect(value: string): Promise<void> {
    if (value === CREATE_VALUE) {
      setMode("create");
      return;
    }
    await openExperiment(value);
    navigate("/experiment");
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Header
        title="rlprompter"
        subtitle="Reinforced prompt generation — tune strategy prompts through feedback"
        hint={mode === "list" ? "↑/↓ move · Enter open · n new · q quit" : ""}
      />
      {mode === "list" ? (
        <Box flexDirection="column" paddingX={theme.spacing.sm}>
          <Text color={theme.colors.secondary}>Experiments</Text>
          <SelectList
            items={items}
            onSelect={(value) => void handleSelect(value)}
          />
        </Box>
      ) : (
        <CreateExperimentForm
          onCancel={() => setMode("list")}
          onCreate={async (input) => {
            await createExperiment(input);
            navigate("/experiment");
          }}
        />
      )}
    </Box>
  );
}

interface CreateFormProps {
  readonly onCancel: () => void;
  readonly onCreate: (input: {
    name: string;
    strategyPath: string;
    seedDir?: string;
    modelOverride?: string;
  }) => Promise<void>;
}

const FIELDS = ["name", "strategyPath", "seedDir", "modelOverride"] as const;

function CreateExperimentForm({ onCancel, onCreate }: CreateFormProps) {
  const theme = useTheme();
  const [focus, setFocus] = useState(0);
  const [name, setName] = useState("");
  const [strategyPath, setStrategyPath] = useState("");
  const [seedDir, setSeedDir] = useState("");
  const [modelOverride, setModelOverride] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useInput((_input, key) => {
    if (key.escape) onCancel();
    if (key.tab) {
      setFocus((current) => (current + 1) % FIELDS.length);
    }
  });

  async function submit(): Promise<void> {
    if (name.trim().length === 0 || strategyPath.trim().length === 0) {
      setError("Name and strategy path are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        strategyPath: strategyPath.trim(),
        ...(seedDir.trim() ? { seedDir: seedDir.trim() } : {}),
        ...(modelOverride.trim()
          ? { modelOverride: modelOverride.trim() }
          : {}),
      });
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function advance(): void {
    if (focus === FIELDS.length - 1) {
      void submit();
    } else {
      setFocus((current) => current + 1);
    }
  }

  return (
    <Box flexDirection="column" gap={1} paddingX={theme.spacing.sm}>
      <Text color={theme.colors.secondary}>
        New experiment — Tab to move, Enter to advance/submit, Esc to cancel
      </Text>
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        onSubmit={advance}
        isActive={focus === 0}
        placeholder="Tune the planner"
      />
      <TextField
        label="Strategy path"
        value={strategyPath}
        onChange={setStrategyPath}
        onSubmit={advance}
        isActive={focus === 1}
        placeholder="./.comma/strategies/plan.json"
      />
      <TextField
        label="Seed/fixture dir (optional)"
        value={seedDir}
        onChange={setSeedDir}
        onSubmit={advance}
        isActive={focus === 2}
        placeholder="./fixtures/sample-repo"
      />
      <TextField
        label="Model override (optional)"
        value={modelOverride}
        onChange={setModelOverride}
        onSubmit={advance}
        isActive={focus === 3}
        placeholder="anthropic/claude-opus-4-8"
      />
      {busy ? <Text color={theme.colors.warning}>Creating…</Text> : null}
      {error ? <Text color={theme.colors.error}>{error}</Text> : null}
    </Box>
  );
}
