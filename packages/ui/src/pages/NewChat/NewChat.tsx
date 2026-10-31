import { useCallback } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { ChatInput } from "../../components/ChatInput";
import { StrategyControls } from "../../components/StrategyControls";
import { TitleIcon } from "../../components/TitleIcon";
import { useStartRun } from "../../hooks/runs";
import { useChatPane } from "../../hooks/useChatPane";
import { useLayout } from "../../hooks/useLayout";
import { useSelectedStrategy } from "../../hooks/useSelectedStrategy";
import styles from "./NewChat.module.scss";

/**
 * Start a run of the pane's strategy with each submitted prompt, then show that run.
 * @returns {React.ReactElement} The empty-chat page.
 */
export function NewChat() {
  const { paneId } = useChatPane();
  const { strategyChoices, chooseStrategy } = useLayout();
  const strategy = useSelectedStrategy({
    path: strategyChoices[paneId],
    onChange: (path) => chooseStrategy(paneId, path),
  });
  const { start, error } = useStartRun();
  const navigate = useNavigate();
  const { selected } = strategy;
  const handleSubmit = useCallback(
    (prompt: string) => {
      void start(selected, prompt).then(
        (runId) => runId && navigate(`/runs/${runId}`, { replace: true }),
      );
    },
    [start, selected, navigate],
  );
  return (
    <NewChatRender
      onSubmit={handleSubmit}
      controls={<StrategyControls strategy={strategy} />}
      error={error}
    />
  );
}

/** Submission handler and the content around the prompt composer. */
export interface NewChatRenderProps {
  /** Receive a submitted prompt. */
  readonly onSubmit: (prompt: string) => void;
  /** Strategy controls shown beneath the composer. */
  readonly controls?: ReactNode;
  /** Why the last attempt to start a run failed. */
  readonly error?: string;
}

/**
 * Arrange the logo, prompt composer, and strategy controls.
 * @param {NewChatRenderProps} props - Component properties.
 * @returns {React.ReactElement} The rendered component.
 */
export function NewChatRender({
  onSubmit,
  controls,
  error,
}: NewChatRenderProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.logo}>
        <TitleIcon />
      </div>
      <div className={styles.content}>
        <ChatInput onSubmit={onSubmit} />
      </div>
      <div className={styles.strategy}>
        {controls}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
