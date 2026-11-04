import { ArrowUp } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  ChangeEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  ReactNode,
} from "react";
import { IconButton } from "../../design-system/IconButton";
import styles from "./ChatInput.module.scss";

/** Submission callback for the local prompt composer. */
export interface ChatInputProps {
  /** Receive a nonempty prompt with outer whitespace removed; resolving with an error message keeps the draft and shows it. */
  readonly onSubmit: (prompt: string) => void | Promise<string | undefined>;
  /** Prevent editing and submitting while the run is unavailable. */
  readonly disabled?: boolean;
  /** Clear a successfully acknowledged message. */
  readonly clearOnSuccess?: boolean;
  /** Describe whether the message answers or steers the run. */
  readonly placeholder?: string;
  /** Focus the field whenever it becomes available, so a conversation can continue without clicking. */
  readonly autoFocus?: boolean;
  /** Extra controls placed before Send, such as Stop; they stay usable while sending is disabled. */
  readonly actions?: ReactNode;
}

/**
 * Own the draft, prevent duplicate sends, and optionally clear after acknowledgement.
 * @param {ChatInputProps} props - Component properties.
 * @returns {React.ReactElement} The rendered component.
 */
export function ChatInput({
  onSubmit,
  disabled = false,
  clearOnSuccess = false,
  placeholder = "Enter your prompt...",
  autoFocus = false,
  actions,
}: ChatInputProps) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string>();
  const handleChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>(
    (event) => {
      setDraft(event.target.value);
    },
    [],
  );
  const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
    (event) => {
      event.preventDefault();
      const prompt = draft.trim();
      // Submitting disables the field and Send, so a second press cannot arrive before this state renders.
      if (!prompt || disabled || submitting) {
        return;
      }
      setSubmitting(true);
      setSubmissionError(undefined);
      Promise.resolve(onSubmit(prompt))
        .then((error) => {
          if (error) {
            setSubmissionError(error);
          } else if (clearOnSuccess) {
            setDraft("");
          }
        })
        .finally(() => {
          setSubmitting(false);
        });
    },
    [draft, onSubmit, disabled, submitting, clearOnSuccess],
  );

  return (
    <>
      <ChatInputRender
        draft={draft}
        disabled={disabled || submitting}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={handleChange}
        onSubmit={handleSubmit}
        actions={actions}
      />
      {submissionError && <p role="alert">{submissionError}</p>}
    </>
  );
}

/** Controlled fields and event handlers for the composer preview. */
export interface ChatInputRenderProps {
  /** Current editable prompt. */
  readonly draft: string;
  /** Prevent editing and submission. */
  readonly disabled?: boolean;
  /** Contextual prompt hint. */
  readonly placeholder?: string;
  /** Focus the field whenever it becomes available. */
  readonly autoFocus?: boolean;
  /** Update the prompt. */
  readonly onChange: ChangeEventHandler<HTMLTextAreaElement>;
  /** Handle form submission. */
  readonly onSubmit: FormEventHandler<HTMLFormElement>;
  /** Extra controls placed before Send. */
  readonly actions?: ReactNode;
}

/**
 * Render the editing surface with one-to-three-line sizing and an inset send action.
 * @param {ChatInputRenderProps} props - Component properties.
 * @returns {React.ReactElement} The rendered component.
 */
export function ChatInputRender({
  draft,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = "Enter your prompt...",
  autoFocus = false,
  actions,
}: ChatInputRenderProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    // Disabling a focused field drops focus to the body, so only reclaim focus nobody else holds.
    if (
      autoFocus &&
      input &&
      (document.activeElement === document.body ||
        !document.activeElement ||
        document.activeElement ===
          formRef.current?.querySelector("[data-cancel]"))
    ) {
      if (!disabled) {
        input.focus();
      } else {
        formRef.current
          ?.querySelector<HTMLButtonElement>("[data-cancel]:enabled")
          ?.focus();
      }
    }
  }, [autoFocus, disabled]);

  const resizeInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    const computedStyle = window.getComputedStyle(input);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight);
    const padding =
      Number.parseFloat(computedStyle.paddingTop) +
      Number.parseFloat(computedStyle.paddingBottom);
    const maximumHeight = lineHeight * 3 + padding;
    const scrollPosition = input.scrollTop;

    // Reset height so scrollHeight measures the content even after text is deleted.
    input.form?.style.setProperty("--scrollbar-offset", "0px");
    input.style.height = "0px";
    input.style.overflowY = "hidden";
    const contentHeight = input.scrollHeight;
    const overflowing = contentHeight > Math.ceil(maximumHeight);

    input.style.height = `${Math.min(maximumHeight, Math.max(lineHeight + padding, contentHeight))}px`;
    input.style.overflowY = overflowing ? "auto" : "hidden";
    input.form?.style.setProperty(
      "--scrollbar-offset",
      overflowing
        ? `${Math.max(10, input.offsetWidth - input.clientWidth)}px`
        : "0px",
    );
    input.scrollTop = scrollPosition;
  }, []);

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLTextAreaElement>>(
    (event) => {
      // Safari may report the final IME Enter as keyCode 229 after composition ends.
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing &&
        event.keyCode !== 229
      ) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
    },
    [],
  );

  useLayoutEffect(() => resizeInput(), [draft, resizeInput]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    let previousWidth = 0;
    let resizeFrame = 0;
    let mounted = true;
    const observer = new ResizeObserver(() => {
      const width = input.getBoundingClientRect().width;
      if (width !== previousWidth) {
        previousWidth = width;
        // Measure after observer delivery so changing height cannot trigger a resize loop.
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(resizeInput);
      }
    });
    observer.observe(input);
    void document.fonts.ready.then(() => {
      if (mounted) {
        resizeInput();
      }
    });
    document.fonts.addEventListener("loadingdone", resizeInput);
    return () => {
      mounted = false;
      observer.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      document.fonts.removeEventListener("loadingdone", resizeInput);
    };
  }, [resizeInput]);

  return (
    <form
      ref={formRef}
      className={styles.composer}
      onSubmit={onSubmit}
      data-actions={actions ? "" : undefined}
    >
      <textarea
        ref={inputRef}
        className={styles.input}
        aria-label="Message"
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        value={draft}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      <div className={styles.actions}>
        {actions}
        <IconButton
          className={styles.send}
          label="Send"
          type="submit"
          disabled={disabled || !draft.trim()}
        >
          <ArrowUp />
        </IconButton>
      </div>
    </form>
  );
}
