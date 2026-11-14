import { useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { ChatComposer } from "../../components/ChatComposer";
import { ChatInput } from "../../components/ChatInput";
import { ModelRolesDialog } from "../../components/ModelRolesDialog";
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
  const { strategyChoices, chooseStrategy, setPanePath } = useLayout();
  const strategy = useSelectedStrategy({
    path: strategyChoices[paneId],
    onChange: (path) => chooseStrategy(paneId, path),
  });
  const { start, error, missingRoles, dismissMissingRoles } = useStartRun();
  const navigate = useNavigate();
  const { selected } = strategy;
  const lastPrompt = useRef("");
  const handleSubmit = useCallback(
    async (prompt: string) => {
      lastPrompt.current = prompt;
      const runId = await start(selected, prompt);
      if (runId) {
        const path = `/runs/${runId}`;
        setPanePath(paneId, path);
        navigate(path, { replace: true });
      }
      return undefined;
    },
    [start, selected, navigate, paneId, setPanePath],
  );
  // Roles are saved on the daemon, so starting the same prompt again now succeeds.
  const handleRolesSaved = useCallback(() => {
    dismissMissingRoles();
    void handleSubmit(lastPrompt.current);
  }, [dismissMissingRoles, handleSubmit]);
  return (
    <>
      <NewChatRender
        onSubmit={handleSubmit}
        controls={<StrategyControls strategy={strategy} />}
        error={error}
      />
      {missingRoles && (
        <ModelRolesDialog
          roles={missingRoles}
          onSaved={handleRolesSaved}
          onCancel={dismissMissingRoles}
        />
      )}
    </>
  );
}

/** Submission handler and the content around the prompt composer. */
export interface NewChatRenderProps {
  /** Receive a submitted prompt. */
  readonly onSubmit: (prompt: string) => void | Promise<string | undefined>;
  /** Strategy controls shown above the input. */
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
        <ChatComposer controls={controls} warnings={error ? [error] : []}>
          <ChatInput onSubmit={onSubmit} />
        </ChatComposer>
      </div>
    </div>
  );
}
