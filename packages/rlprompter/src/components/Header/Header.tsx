import { Box, Text } from "ink";
import { useTheme } from "../../theme";

export interface HeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  /** Key hints rendered on the right (e.g. "Enter run · Esc back"). */
  readonly hint?: string;
}

/** Page header: title + optional subtitle and key hints. */
export function Header({ title, subtitle, hint }: HeaderProps) {
  const theme = useTheme();
  return (
    <Box
      flexDirection="column"
      borderStyle={theme.borders.style as never}
      borderColor={theme.borders.color}
      paddingX={theme.spacing.sm}
    >
      <Box justifyContent="space-between">
        <Text color={theme.colors.primary} bold={theme.typography.headerBold}>
          {title}
        </Text>
        {hint ? <Text color={theme.colors.muted}>{hint}</Text> : null}
      </Box>
      {subtitle ? (
        <Text
          color={theme.colors.secondary}
          dimColor={theme.typography.secondaryDim}
        >
          {subtitle}
        </Text>
      ) : null}
    </Box>
  );
}
