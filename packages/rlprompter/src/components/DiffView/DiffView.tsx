import { Box, Text } from "ink";
import { useTheme } from "../../theme";

export interface DiffViewProps {
  /** Unified-diff text (as produced by core's `unifiedDiff`). */
  readonly diff: string;
  /** Max lines to render before truncating. Defaults to 40. */
  readonly maxLines?: number;
}

/** Render a unified diff with +/- lines colored. */
export function DiffView({ diff, maxLines = 40 }: DiffViewProps) {
  const theme = useTheme();
  if (diff.trim().length === 0) {
    return <Text color={theme.colors.muted}>(no content changes)</Text>;
  }

  const lines = diff.split("\n");
  const shown = lines.slice(0, maxLines);
  const truncated = lines.length - shown.length;

  return (
    <Box flexDirection="column">
      {shown.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are a static, non-reorderable snapshot
        <Text key={index} color={colorFor(line, theme)}>
          {line.length > 0 ? line : " "}
        </Text>
      ))}
      {truncated > 0 ? (
        <Text color={theme.colors.muted}>… {truncated} more lines</Text>
      ) : null}
    </Box>
  );
}

function colorFor(
  line: string,
  theme: ReturnType<typeof useTheme>,
): string | undefined {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return theme.colors.diffAdded;
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return theme.colors.diffRemoved;
  }
  if (line.startsWith("@@")) return theme.colors.secondary;
  if (
    line.startsWith("+++") ||
    line.startsWith("---") ||
    line.startsWith("===")
  ) {
    return theme.colors.muted;
  }
  return undefined;
}
