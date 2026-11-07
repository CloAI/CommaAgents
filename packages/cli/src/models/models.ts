import { DEFAULT_MODEL_ROLES } from "@comma-agents/core";
import { loadDaemonConfig, writeConfigModelRoles } from "@comma-agents/daemon";

/**
 * Read repeated `role=provider/model` flags into a role map.
 * @param {readonly string[]} entries - Flag values such as `medium=openai/gpt-5`.
 * @returns {Record<string, string>} Models keyed by role name.
 * @throws {Error} When an entry is not `role=provider/model`.
 */
export function parseModelRoleFlags(
  entries: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    entries.map((entry) => {
      const [role, ...model] = entry.split("=");
      if (!role || model.length === 0 || model.join("=") === "") {
        throw new Error(
          `Invalid --model-role "${entry}". Use role=provider/model, e.g. medium=openai/gpt-5.`,
        );
      }
      return [role.replace(/^@/, ""), model.join("=")];
    }),
  );
}

/**
 * Explain which roles a run needs and how to set them.
 * @param {readonly string[]} roles - Role names without the `@` prefix.
 * @returns {string} Message naming each missing role with the command that sets it.
 */
export function describeMissingModelRoles(roles: readonly string[]): string {
  return [
    `Missing models for: ${roles.map((role) => `@${role}`).join(", ")}`,
    ...roles.map((role) => `  comma models set ${role} <provider/model>`),
  ].join("\n");
}

/**
 * List the configured roles, or save one in the daemon config file.
 * A running daemon reads the file on start, so restart it to apply a change.
 * @param {"list" | "set"} action - Operation to perform.
 * @param {string} [role] - Role name for `set`.
 * @param {string} [model] - `provider/model` for `set`.
 */
export function runModels(
  action: "list" | "set",
  role?: string,
  model?: string,
): void {
  const config = loadDaemonConfig();
  if (action === "list") {
    for (const { name, description } of DEFAULT_MODEL_ROLES) {
      console.log(
        `@${name}\t${config.modelRoles[name] ?? "(not set)"}\t${description}`,
      );
    }
    return;
  }
  if (role === undefined || model === undefined) {
    throw new Error("Usage: comma models set <role> <provider/model>");
  }
  writeConfigModelRoles(config.configFile, {
    ...config.modelRoles,
    [role]: model,
  });
  console.log(`@${role} → ${model} (restart the daemon to apply)`);
}
