import { Navigate, useNavigate, useParams } from "react-router";
import { Button } from "../../design-system/Button";
import { RunProvider, useRunFeed } from "../../hooks/runs";
import { RunComposer } from "./RunComposer";
import { RunOutput } from "./RunOutput";
import styles from "./RunPage.module.scss";

/**
 * Show one run's streamed output as a section per message, taken from the route.
 * @returns {React.ReactElement} The run page, or a redirect to a new chat without a run ID.
 */
export function RunPage() {
  const { runId } = useParams();
  // Keyed so opening another run starts from a clean slate.
  return runId ? (
    <RunProvider key={runId} runId={runId}>
      <RunView runId={runId} />
    </RunProvider>
  ) : (
    <Navigate to="/" replace />
  );
}

/**
 * Lay out the run's output and composer.
 * @param {{runId: string}} props - Run being shown.
 * @returns {React.ReactElement} The run page.
 */
function RunView({ runId }: { readonly runId: string }) {
  const navigate = useNavigate();
  const { unavailable } = useRunFeed();
  return (
    <div
      className={styles.page}
      role="group"
      aria-label="Run"
      data-run-page={runId}
    >
      {unavailable ? (
        <p role="alert" className={styles.failure}>
          {unavailable}
          <Button onClick={() => navigate("/")}>New chat</Button>
        </p>
      ) : (
        <>
          <RunOutput />
          <RunComposer runId={runId} />
        </>
      )}
    </div>
  );
}
