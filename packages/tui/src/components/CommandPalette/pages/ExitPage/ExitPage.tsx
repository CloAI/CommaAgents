import { useApp, useFocus } from "ink";
import type React from "react";
import { useEffect } from "react";

const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

export interface ExitPageProps {
  /** Unique identifier for the page focus zone. */
  readonly focusId: string;
  /** Return to the command list. */
  readonly onBack: () => void;
}

export function ExitPage({
  focusId,
}: ExitPageProps): React.ReactElement | null {
  const { exit } = useApp();

  useFocus({ id: focusId, isActive: RAW_MODE_SUPPORTED });

  useEffect(() => {
    exit();
  }, [exit]);

  return null;
}
