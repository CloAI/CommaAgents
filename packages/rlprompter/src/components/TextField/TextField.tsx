import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useTheme } from "../../theme";

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly placeholder?: string;
  /** Only the focused field should accept input. Defaults to true. */
  readonly isActive?: boolean;
}

/** A labeled single-line text input built on ink-text-input. */
export function TextField({
  label,
  value,
  onChange,
  onSubmit,
  placeholder,
  isActive = true,
}: TextFieldProps) {
  const theme = useTheme();
  return (
    <Box flexDirection="column">
      <Text
        color={isActive ? theme.colors.primary : theme.colors.muted}
        bold={theme.typography.labelBold}
      >
        {label}
      </Text>
      <Box
        borderStyle={theme.borders.style as never}
        borderColor={isActive ? theme.colors.primary : theme.borders.color}
        paddingX={theme.spacing.xs}
      >
        <TextInput
          value={value}
          onChange={onChange}
          {...(onSubmit ? { onSubmit } : {})}
          focus={isActive}
          {...(placeholder ? { placeholder } : {})}
        />
      </Box>
    </Box>
  );
}
