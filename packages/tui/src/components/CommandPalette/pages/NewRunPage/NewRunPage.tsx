import { useFocus } from "ink";
import type React from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router";

import { useChatRunLifecycle } from "../../../../hooks/useChat/useChatRunLifecycle";
import { useCommandPalette } from "../../useCommandPalette";

export interface NewRunPageProps {
  /** Unique identifier for the page focus zone. */
  readonly focusId: string;
  /** Return to the command list. */
  readonly onBack: () => void;
}

export function NewRunPage({
  focusId,
}: NewRunPageProps): React.ReactElement | null {
  const navigate = useNavigate();
  const { clearAllChatRuns } = useChatRunLifecycle();
  const { closePalette } = useCommandPalette();

  useFocus({ id: focusId });

  useEffect(() => {
    clearAllChatRuns();
    navigate("/");
    closePalette();
  }, [clearAllChatRuns, closePalette, navigate]);

  return null;
}
