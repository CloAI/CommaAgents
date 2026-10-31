import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "../../../../../design-system/Button";
import { useDaemonMutation } from "../../../../../hooks/useDaemonMutation";
import { CommaAgentsDaemonContext } from "../../../../../hooks/useCommaAgentsDaemon/useCommaAgentsDaemon.context";
import { providerErrorMessage } from "../ProviderConfigurationDialog.utils";
import type { OpenAISignInProps } from "./OpenAISignIn.types";
import styles from "../ProviderConfigurationDialog.module.scss";

/** Keep browser authorization separate from the API-key form and never receive tokens.
 * @param {OpenAISignInProps} props - Owning workflow callbacks.
 * @returns {React.ReactElement} Sign-in actions and progress.
 */
export function OpenAISignIn({ onConnected, onBusyChange }: OpenAISignInProps) {
  const context = useContext(CommaAgentsDaemonContext);
  const { mutate: begin } = useDaemonMutation("core.providers.beginSignIn");
  const { mutate: getStatus } = useDaemonMutation(
    "core.providers.getSignInStatus",
  );
  const { mutate: cancel } = useDaemonMutation("core.providers.cancelSignIn");
  const [attempt, setAttempt] = useState<{
    attemptId: string;
    authorizationURL: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const popup = useRef<Window | null>(null);
  const localDaemon =
    context &&
    ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(context.endpoint).hostname,
    );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Cleanup sends a cancellation without depending on an unmounted mutation hook.
      if (active.current && context) {
        const dispose = context.command(
          "core.providers.cancelSignIn",
          { attemptId: active.current },
          () => {},
        );
        dispose();
      }
      popup.current?.close();
      onBusyChange(false);
    };
  }, [context, onBusyChange]);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (!attempt) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await getStatus({ attemptId: attempt.attemptId });
        if (disposed) return;
        if (result.status === "pending") {
          timer = setTimeout(() => void poll(), 800);
          return;
        }
        active.current = undefined;
        setAttempt(undefined);
        if (result.status === "connected") await onConnected();
        else setError(result.message ?? "ChatGPT sign-in was cancelled.");
      } catch (caught) {
        if (disposed) return;
        setError(providerErrorMessage(caught));
        // Keep the handle so Cancel/retry can clean up an attempt after a socket failure.
      }
      if (!disposed) setBusy(false);
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [attempt, getStatus, onConnected]);

  const start = useCallback(() => {
    if (busy || !localDaemon) return;
    setError(undefined);
    setBusy(true);
    // Open synchronously in the click handler to avoid popup blockers after the command.
    popup.current = window.open("about:blank", "_blank");
    if (popup.current) popup.current.opener = null;
    void (async () => {
      try {
        const result = await begin({ providerId: "openai" });
        if (!mounted.current) {
          const dispose = context!.command(
            "core.providers.cancelSignIn",
            { attemptId: result.attemptId },
            () => {},
          );
          dispose();
          return;
        }
        active.current = result.attemptId;
        setAttempt(result);
        if (popup.current)
          popup.current.location.href = result.authorizationURL;
      } catch (caught) {
        popup.current?.close();
        if (mounted.current) {
          setError(providerErrorMessage(caught));
          setBusy(false);
        }
      }
    })();
  }, [begin, busy, context, localDaemon]);

  const stop = useCallback(() => {
    if (!attempt) return;
    void cancel({ attemptId: attempt.attemptId })
      .then((result) => {
        if (!mounted.current) return;
        if (result.status === "pending") return;
        if (result.status === "connected") {
          void onConnected().catch((caught: unknown) =>
            setError(providerErrorMessage(caught)),
          );
        }
        active.current = undefined;
        setAttempt(undefined);
        setBusy(false);
        popup.current?.close();
      })
      .catch((caught: unknown) => {
        if (mounted.current) setError(providerErrorMessage(caught));
      });
  }, [attempt, cancel, onConnected]);

  return (
    <div className={styles.subscription}>
      <p className={styles.notice}>
        Use your ChatGPT subscription. Sign-in opens in your browser.
      </p>
      {!localDaemon && (
        <p className={styles.notice}>
          ChatGPT sign-in requires the daemon and browser on the same computer.
          Connect to a local daemon to continue.
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {attempt ? (
        <>
          <p role="status" className={styles.notice}>
            Waiting for ChatGPT sign-in...
          </p>
          <a href={attempt.authorizationURL} target="_blank" rel="noreferrer">
            Open sign-in page
          </a>
          <Button onClick={stop}>Cancel sign-in</Button>
        </>
      ) : (
        <Button disabled={busy || !localDaemon} onClick={start}>
          {busy ? "Starting sign-in..." : "Continue with ChatGPT"}
        </Button>
      )}
      <a
        href="https://chatgpt.com/settings/usage"
        target="_blank"
        rel="noreferrer"
      >
        Manage ChatGPT usage
      </a>
    </div>
  );
}
