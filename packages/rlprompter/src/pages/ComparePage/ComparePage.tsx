import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { DiffView, Header } from "../../components";
import { compareIterations, type IterationComparison } from "../../engine";
import { useExperiment } from "../../hooks/useExperiment";
import { useTheme } from "../../theme";

/** Side-by-side comparison of two selected iterations. */
export function ComparePage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { active, compareSelection, getIterationEvents } = useExperiment();

  const [comparison, setComparison] = useState<IterationComparison | null>(
    null,
  );
  const [labels, setLabels] = useState<[string, string] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) navigate("/experiment");
  });

  useEffect(() => {
    if (!active || compareSelection.length !== 2) {
      navigate("/experiment");
      return;
    }
    const [idA, idB] = compareSelection;
    const labelOf = (id: string): string => {
      const iteration = active.iterations.find((it) => it.id === id);
      return iteration ? `Iteration #${iteration.index}` : id.slice(0, 8);
    };

    void (async () => {
      try {
        const [eventsA, eventsB] = await Promise.all([
          getIterationEvents(idA!),
          getIterationEvents(idB!),
        ]);
        const labelA = labelOf(idA!);
        const labelB = labelOf(idB!);
        setLabels([labelA, labelB]);
        setComparison(
          compareIterations(
            { label: labelA, events: eventsA },
            { label: labelB, events: eventsB },
          ),
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
  }, [active, compareSelection, getIterationEvents, navigate]);

  return (
    <Box flexDirection="column" gap={1}>
      <Header
        title="Compare iterations"
        subtitle={labels ? `${labels[0]} → ${labels[1]}` : "Loading…"}
        hint="Esc back"
      />

      {error ? <Text color={theme.colors.error}>{error}</Text> : null}

      {comparison ? (
        <Box flexDirection="column" gap={1} paddingX={theme.spacing.sm}>
          <Box flexDirection="column">
            <Text color={theme.colors.secondary}>Output diff</Text>
            <DiffView diff={comparison.textDiff} maxLines={20} />
          </Box>

          <Box flexDirection="column">
            <Text color={theme.colors.secondary}>
              File changes ({comparison.files.length})
            </Text>
            {comparison.files.length === 0 ? (
              <Text color={theme.colors.muted}>
                No file-level differences between these iterations.
              </Text>
            ) : (
              comparison.files.map((file) => (
                <Box key={file.path} flexDirection="column" marginTop={1}>
                  <Text color={colorForStatus(file.status, theme)}>
                    {file.status.toUpperCase()} {file.path}
                  </Text>
                  {file.diff ? (
                    <DiffView diff={file.diff} maxLines={12} />
                  ) : null}
                </Box>
              ))
            )}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

function colorForStatus(
  status: IterationComparison["files"][number]["status"],
  theme: ReturnType<typeof useTheme>,
): string {
  switch (status) {
    case "added":
      return theme.colors.success;
    case "removed":
      return theme.colors.error;
    case "changed":
      return theme.colors.warning;
    default:
      return theme.colors.muted;
  }
}
