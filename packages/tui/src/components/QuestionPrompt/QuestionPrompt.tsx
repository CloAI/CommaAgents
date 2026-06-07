import { Box, Text, useFocusManager } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import { useTheme } from "../../Theme";
import { TextAreaInput } from "../TextAreaInput";
import type {
  QuestionPromptProps,
  QuestionPromptRenderProps,
} from "./QuestionPrompt.types";

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
    <QuestionPromptRender
      actor={actor}
      question={question}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      onSubmit={onSubmit}
      colors={{
        primary: tokens.colors.primary,
        secondary: tokens.colors.secondary,
      }}
    />
  );
}

export function QuestionPromptRender({
  actor,
  question,
  onSubmit,
  inputValue,
  onInputValueChange,
  colors,
}: QuestionPromptRenderProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={colors.primary}
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color={colors.primary}>
          ❓ Question / Feedback Request
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text bold>{actor}</Text>
          <Text color={colors.secondary}> asks:</Text>
        </Text>
        <Text color={colors.primary}>{question}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={colors.secondary} dimColor>
          {"─".repeat(40)}
        </Text>
      </Box>

      <Box>
        <TextAreaInput
          id={QUESTION_INPUT_ID}
          value={inputValue}
          onChange={onInputValueChange}
          placeholder="Type your feedback/answer here and press Enter to submit..."
          onSubmit={(val) => {
            if (val.trim()) {
              onSubmit(val.trim());
            }
          }}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor color={colors.secondary}>
          Enter to submit | Ctrl/Shift/Meta+Enter for newline
        </Text>
      </Box>
    </Box>
  );
}
