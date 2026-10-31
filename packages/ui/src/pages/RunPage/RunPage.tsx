import { RunErrorCode } from "@comma-agents/daemon/protocol";
import { useCallback, useContext, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Button } from "../../design-system/Button";
import { RunProvider, useRunStop } from "../../hooks/runs";
import { ChatPaneContext } from "../../hooks/useChatPane";
import type { DaemonFailure } from "../../hooks/useDaemonMutation";
import { useDoublePress } from "../../hooks/useDoublePress";
import { LayoutContext } from "../../hooks/useLayout/useLayout.context";
import { RunComposer } from "./RunComposer";
import { RunDialogs } from "./RunDialogs";
import { RunOutput } from "./RunOutput";
import { isRunPageTarget } from "./RunPage.utils";
import styles from "./RunPage.module.scss";

/**
 * Show one run's streamed output as a section per message, taken from the route.
 * @returns {React.ReactElement} The run page, or a redirect to a new chat without a run ID.
 */
export function RunPage() {
  const { runId } = useParams();
  // Keyed so opening another run starts from a clean slate.
  return runId ? (
    <FollowedRun key={runId} runId={runId} />
  ) : (
    <Navigate to="/" replace />
  );
}

/**
 * Follow a run and explain when it cannot be followed.
 * @param {{runId: string}} props - Component properties.
 * @returns {React.ReactElement} The run within its provider.
 */
function FollowedRun({ runId }: { readonly runId: string }) {
  const [failure, setFailure] = useState<string>();
  const handleError = useCallback(
    (error: DaemonFailure) =>
      setFailure(
        error.code === RunErrorCode.RUN_NOT_FOUND
          ? "Run not found."
          : error.message,
      ),
    [],
  );
  return (
    <RunProvider runId={runId} onError={handleError}>
      <RunView runId={runId} failure={failure} />
    </RunProvider>
  );
}

/**
 * Lay out the run's output, composer, and dialogs, and stop it on a double Escape.
 * @param {{runId: string, failure?: string}} props - Run and why it cannot be followed, if so.
 * @returns {React.ReactElement} The run page.
 */
function RunView({
  runId,
  failure,
}: {
  readonly runId: string;
  readonly failure: string | undefined;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const pane = useContext(ChatPaneContext);
  const layout = useContext(LayoutContext);
  const stop = useRunStop();
  const focused = !pane || layout?.layout.activeId === pane.paneId;
  const isInScope = useCallback(
    (target: Element | null) =>
      isRunPageTarget(rootRef.current, target, pane !== null),
    [pane],
  );
  const { armed } = useDoublePress({
    key: "Escape",
    enabled: stop.canStop && focused,
    onTrigger: stop.stop,
    scopeRef: rootRef,
    isInScope,
  });
  return (
    <div
      className={styles.page}
      role="group"
      aria-label="Run"
      ref={rootRef}
      data-run-page={runId}
    >
      {failure ? (
        <p role="alert" className={styles.failure}>
          {failure}
          <Button onClick={() => navigate("/")}>New chat</Button>
        </p>
      ) : (
        <>
          <RunOutput />
          <RunComposer runId={runId} stopHint={armed} />
        </>
      )}
      <RunDialogs />
    </div>
  );
}
