import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { SelectItem } from "../../components";
import { Header, SelectList, TextField } from "../../components";
import type { Iteration } from "../../engine";
import { useExperiment } from "../../hooks/useExperiment";
import { useTheme } from "../../theme";

type Mode = "browse" | "input";

/** Main experiment view: run iterations, browse history, inspect output. */
export function IterationPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const {
    active,
    queuedOverrides,
    live,
    selectedIterationId,
    compareSelection,
    selectIteration,
    runNextIteration,
    toggleCompare,
    closeExperiment,
  } = useExperiment();

  const [mode, setMode] = useState<Mode>("browse");
  const [input, setInput] = useState("");

  // Guard: no active experiment → back to picker.
  useEffect(() => {
    if (!active) navigate("/");
  }, [active, navigate]);

  useInput(
    (key, modifiers) => {
      if (modifiers.escape) {
        closeExperiment();
        navigate("/");
        return;
      }
      if (key === "i") setMode("input");
      else if (key === "f" && selectedIterationId) navigate("/feedback");
      else if (key === "c" && selectedIterationId)
        toggleCompare(selectedIterationId);
      else if (key === "C" && compareSelection.length === 2)
        navigate("/compare");
    },
    { isActive: mode === "browse" && !live.running },
  );

  if (!active) return null;

  const items: ReadonlyArray<SelectItem<string>> = active.iterations.map(
    (iteration) => ({
      label: `#${iteration.index} ${statusGlyph(iteration)} ${iteration.summary.status}`,
      value: iteration.id,
      hint: `${iteration.summary.mutationCount} muts · ${
        iteration.summary.promptTokens + iteration.summary.completionTokens
      } tok${compareSelection.includes(iteration.id) ? " · ✓cmp" : ""}`,
    }),
  );

  const selected = active.iterations.find(
    (it) => it.id === selectedIterationId,
  );

  return (
    <Box flexDirection="column" gap={1}>
      <Header
        title={active.name}
        subtitle={active.strategyPath}
        hint="i input · f feedback · c compare-pick · C compare · Esc back"
      />

      <Box gap={2} paddingX={theme.spacing.sm}>
        <Box flexDirection="column" width={36}>
          <Text color={theme.colors.secondary}>
            Iterations ({active.iterations.length})
          </Text>
          <SelectList
            items={items}
            isActive={mode === "browse" && !live.running}
            onHighlight={selectIteration}
            onSelect={selectIteration}
            emptyMessage="No iterations yet. Press i to run one."
          />
          {queuedOverrides.length > 0 ? (
            <Text color={theme.colors.warning}>
              {queuedOverrides.length} override(s) queued for next run
            </Text>
          ) : null}
        </Box>

        <Box flexDirection="column" flexGrow={1}>
          {live.running ? (
            <RunningPanel />
          ) : selected ? (
            <IterationDetail iteration={selected} />
          ) : (
            <Text color={theme.colors.muted}>
              Select an iteration, or press i to run the first one.
            </Text>
          )}
        </Box>
      </Box>

      {mode === "input" ? (
        <Box paddingX={theme.spacing.sm} flexDirection="column">
          <TextField
            label="Input for next iteration (Enter to run, Esc to cancel)"
            value={input}
            onChange={setInput}
            isActive
            onSubmit={(value) => {
              setMode("browse");
              setInput("");
              void runNextIteration(value);
            }}
            placeholder="Describe the task to feed the strategy…"
          />
          <EscToBrowse onEscape={() => setMode("browse")} />
        </Box>
      ) : null}

      {live.error ? (
        <Text color={theme.colors.error}>Error: {live.error}</Text>
      ) : null}
    </Box>
  );
}

/** Handles Esc while the input field holds focus. */
function EscToBrowse({ onEscape }: { readonly onEscape: () => void }) {
  useInput((_input, key) => {
    if (key.escape) onEscape();
  });
  return null;
}

function RunningPanel() {
  const theme = useTheme();
  const { live } = useExperiment();
  const steps = live.events.filter((e) => e.type === "step_started").length;
  return (
    <Box flexDirection="column">
      <Text color={theme.colors.warning}>● Running… ({steps} steps)</Text>
      <Text>{live.text.slice(-1500)}</Text>
    </Box>
  );
}

function IterationDetail({ iteration }: { readonly iteration: Iteration }) {
  const theme = useTheme();
  return (
    <Box flexDirection="column">
      <Text color={theme.colors.primary} bold>
        Iteration #{iteration.index} — {iteration.summary.status}
      </Text>
      <Text color={theme.colors.muted}>
        {iteration.summary.promptTokens} prompt /{" "}
        {iteration.summary.completionTokens} completion tokens ·{" "}
        {iteration.summary.mutationCount} file mutations
      </Text>
      {iteration.overrides.length > 0 ? (
        <Text color={theme.colors.secondary}>
          {iteration.overrides.length} override(s) applied
        </Text>
      ) : null}
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.secondary}>Output</Text>
        <Text>{iteration.summary.text.slice(0, 2000) || "(empty)"}</Text>
      </Box>
      {iteration.feedback ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.colors.success}>
            Feedback{" "}
            {iteration.feedback.score !== undefined
              ? `(score ${iteration.feedback.score})`
              : ""}
          </Text>
          <Text>{iteration.feedback.notes ?? ""}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function statusGlyph(iteration: Iteration): string {
  switch (iteration.summary.status) {
    case "completed":
      return "✓";
    case "error":
      return "✗";
    default:
      return "•";
  }
}
