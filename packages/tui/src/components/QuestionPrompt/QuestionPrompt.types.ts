import type { RequestQuestionMessage } from "@comma-agents/daemon";

export interface QuestionPromptProps {
  /** The daemon's `request_question` message to display. */
  readonly request: RequestQuestionMessage;
  /** Called when the user submits their answer. */
  readonly onSubmit: (response: string) => void;
}

export interface QuestionPromptRenderProps {
  readonly actor: string;
  readonly question: string;
  readonly onSubmit: (response: string) => void;
  readonly inputValue: string;
  readonly onInputValueChange: (val: string) => void;
  readonly colors: {
    readonly primary: string;
    readonly secondary: string;
  };
}
