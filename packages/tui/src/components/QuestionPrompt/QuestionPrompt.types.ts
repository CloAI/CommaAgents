import type { PendingQuestionRequest } from "../../hooks/useChat/useChat.types";

export interface QuestionPromptProps {
  /** The question request to display. */
  readonly request: PendingQuestionRequest;
  /** Called when the user submits their answer. */
  readonly onSubmit: (response: string) => void;
}

export interface QuestionPromptRenderProps {
  readonly actor: string;
  readonly question: string;
  readonly onSubmit: (response: string) => void;
  readonly colors: {
    readonly primary: string;
    readonly secondary: string;
  };
}
