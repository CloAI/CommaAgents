import { DEFAULT_MODEL_ROLES } from "@comma-agents/core";
import type { z } from "zod/v4";
import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { CorePlugin } from "../../../core.types";
import {
  GetModelRolesArgumentsSchema,
  ModelRolesOutputSchema,
  SetModelRolesArgumentsSchema,
} from "./model-roles.schemas";

/**
 * Summarize the configured roles with the roles every daemon offers.
 * @param {CorePlugin} plugin - Core plugin holding the roles.
 * @returns {z.output<typeof ModelRolesOutputSchema>} Configured roles and offered defaults.
 */
export function describeModelRoles(plugin: CorePlugin) {
  return {
    modelRoles: plugin.getModelRoles(),
    defaults: DEFAULT_MODEL_ROLES.map(({ name, description }) => ({
      name,
      description,
    })),
  };
}

/** Read the configured models for `@role` references and the roles every daemon offers. */
export const getModelRolesCommand = defineCommand({
  name: "core.modelRoles.get",
  arguments: GetModelRolesArgumentsSchema,
  output: ModelRolesOutputSchema,
  handle({
    plugin,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof GetModelRolesArgumentsSchema>
  >) {
    return describeModelRoles(plugin);
  },
});

/** Replace the configured models; the next strategy load uses them. */
export const setModelRolesCommand = defineCommand({
  name: "core.modelRoles.set",
  arguments: SetModelRolesArgumentsSchema,
  output: ModelRolesOutputSchema,
  handle({
    plugin,
    arguments: options,
  }: CommandContext<
    CorePlugin,
    undefined,
    z.output<typeof SetModelRolesArgumentsSchema>
  >) {
    plugin.setModelRoles(options.modelRoles);
    return describeModelRoles(plugin);
  },
});
