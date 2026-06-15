import type { RequestPermissionMessage } from "@comma-agents/daemon";
import { Box, Text, useFocusManager } from "ink";
import type React from "react";
import { useEffect } from "react";
import { useTheme } from "../../Theme";
import { Button } from "../Button";

/** Decision option presented to the user. */
export type PermissionDecision =
  | "allow"
  | "deny"
  | "allow-session"
  | "deny-session";

export interface PermissionPromptProps {
  /** The daemon's `request_permission` message to display. */
  readonly request: RequestPermissionMessage;
  /** Called when the user makes a decision. */
  readonly onDecide: (decision: PermissionDecision) => void;
}

export interface PermissionPromptRenderProps {
  readonly actor: string;
  readonly verb: string;
  readonly resource: string;
  readonly onDecide: (decision: PermissionDecision) => void;
  readonly colors: {
    readonly warning: string;
    readonly secondary: string;
    readonly primary: string;
  };
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
function operationLabel(
  operation: RequestPermissionMessage["operation"],
): string {
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
export function PermissionPrompt({
  request,
  onDecide,
}: PermissionPromptProps): React.ReactElement {
  const { agentName, toolName, operation, resource } = request;
  const { focus } = useFocusManager();
  const tokens = useTheme();

  const actor = toolName ? `${agentName} (${toolName})` : agentName;
  const verb = operationLabel(operation);

  useEffect(() => {
    if (RAW_MODE_SUPPORTED) focus(FOCUS_IDS.allow);
  }, [focus]);

  return (
    <PermissionPromptRender
      actor={actor}
      verb={verb}
      resource={resource}
      onDecide={onDecide}
      colors={{
        warning: tokens.colors.warning,
        secondary: tokens.colors.secondary,
        primary: tokens.colors.primary,
      }}
    />
  );
}

export function PermissionPromptRender({
  actor,
  verb,
  resource,
  onDecide,
  colors,
}: PermissionPromptRenderProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={colors.warning}
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color={colors.warning}>
          ⚠ Permission request
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text bold>{actor}</Text>
          <Text color={colors.secondary}> wants to </Text>
          <Text bold>{verb}</Text>
          <Text color={colors.secondary}>:</Text>
        </Text>
        <Text color={colors.primary}>{resource}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={colors.secondary} dimColor>
          {"─".repeat(40)}
        </Text>
      </Box>

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

      <Box marginTop={1}>
        <Text dimColor color={colors.secondary}>
          Tab · ↵ to select | mouse click also works
        </Text>
      </Box>
    </Box>
  );
}
