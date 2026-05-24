import { Box, Text, useFocusManager } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import { useTheme } from "../../theme";
import { TextAreaInput } from "../TextAreaInput";
import type { QuestionPromptProps } from "./QuestionPrompt.types";

const QUESTION_INPUT_ID = "question-prompt-input";

export function QuestionPrompt({
  request,
  onSubmit,
}: QuestionPromptProps): React.ReactElement {
  const { agentName, toolName, question } = request;
  const { focus } = useFocusManager();
  const tokens = useTheme();
  const [inputValue, setInputValue] = useState("");

  const actor = toolName ? `${agentName} (${toolName})` : agentName;

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus on request change
  useEffect(() => {
    focus(QUESTION_INPUT_ID);
  }, [focus, request.questionRequestId]);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={tokens.colors.primary}
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color={tokens.colors.primary}>
          ❓ Question / Feedback Request
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text bold>{actor}</Text>
          <Text color={tokens.colors.secondary}> asks:</Text>
        </Text>
        <Text color={tokens.colors.primary}>{question}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={tokens.colors.secondary} dimColor>
          {"─".repeat(40)}
        </Text>
      </Box>

      <Box height={5}>
        <TextAreaInput
          id={QUESTION_INPUT_ID}
          value={inputValue}
          onChange={setInputValue}
          placeholder="Type your feedback/answer here and press Enter to submit..."
          onSubmit={(val) => {
            if (val.trim()) {
              onSubmit(val.trim());
            }
          }}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor color={tokens.colors.secondary}>
          Enter to submit | Ctrl/Shift/Meta+Enter for newline
        </Text>
      </Box>
    </Box>
  );
}
