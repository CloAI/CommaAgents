import { Box, Text, useFocusManager } from "ink";
import type React from "react";
import { useEffect } from "react";
import { Button } from "../Button";
import { useTheme } from "../../theme";
import type { PendingPermissionRequest } from "../../hooks/useChat";

/** Decision option presented to the user. */
export type PermissionDecision = "allow" | "deny" | "allow-session" | "deny-session";

export interface PermissionPromptProps {
  /** The permission request to display. */
  readonly request: PendingPermissionRequest;
  /** Called when the user makes a decision. */
  readonly onDecide: (decision: PermissionDecision) => void;
}

/** Raw mode check for safe `useInput` activation. */
const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

/** Stable focus IDs for each decision button — order determines Tab cycle. */
const FOCUS_IDS = {
  allow: "permission-allow",
  allowSession: "permission-allow-session",
  deny: "permission-deny",
  denySession: "permission-deny-session",
} as const;

/** Human-readable label for an operation category. */
function operationLabel(operation: PendingPermissionRequest["operation"]): string {
  switch (operation) {
    case "fs.read":
      return "read";
    case "fs.write":
      return "write";
    case "fs.exec":
      return "execute";
  }
}

/**
 * Renders a permission-request prompt with a row of tabbable action buttons.
 *
 * Focus starts on "Allow once" when the prompt mounts. Tab / Shift+Tab cycle
 * through all four options; Enter (or a mouse click) confirms the focused
 * choice.
 *
 * The background is provided by the Frame's global flood-fill (driven by
 * `tokens.colors.background`), so no per-component fill is needed here.
 */
export function PermissionPrompt({ request, onDecide }: PermissionPromptProps): React.ReactElement {
  const { agentName, toolName, operation, resource } = request;
  const { focus } = useFocusManager();
  const tokens = useTheme();

  const actor = toolName ? `${agentName} (${toolName})` : agentName;
  const verb = operationLabel(operation);

  // Seed focus on the first button every time a new prompt appears.
  useEffect(() => {
    if (RAW_MODE_SUPPORTED) focus(FOCUS_IDS.allow);
  }, [focus, request]);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={tokens.colors.warning}
      paddingX={2}
      paddingY={1}
    >
      {/* ── Header ── */}
      <Box marginBottom={1}>
        <Text bold color={tokens.colors.warning}>⚠ Permission request</Text>
      </Box>

      {/* ── Request body ── */}
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text bold>{actor}</Text>
          <Text color={tokens.colors.secondary}> wants to </Text>
          <Text bold>{verb}</Text>
          <Text color={tokens.colors.secondary}>:</Text>
        </Text>
        <Text color={tokens.colors.primary}>{resource}</Text>
      </Box>

      {/* ── Separator line ── */}
      <Box marginBottom={1}>
        <Text color={tokens.colors.secondary} dimColor>{"─".repeat(40)}</Text>
      </Box>

      {/* ── Decision buttons ── */}
      <Box flexDirection="row" gap={2}>
        <Button
          id={FOCUS_IDS.allow}
          label="Allow once"
          variant="primary"
          onPress={() => onDecide("allow")}
        />
        <Button
          id={FOCUS_IDS.allowSession}
          label="Allow session"
          variant="secondary"
          onPress={() => onDecide("allow-session")}
        />
        <Button
          id={FOCUS_IDS.deny}
          label="Deny once"
          variant="danger"
          onPress={() => onDecide("deny")}
        />
        <Button
          id={FOCUS_IDS.denySession}
          label="Deny session"
          variant="ghost"
          onPress={() => onDecide("deny-session")}
        />
      </Box>

      {/* ── Usage hint ── */}
      <Box marginTop={1}>
        <Text dimColor color={tokens.colors.secondary}>Tab · ↵ to select  |  mouse click also works</Text>
      </Box>
    </Box>
  );
}
