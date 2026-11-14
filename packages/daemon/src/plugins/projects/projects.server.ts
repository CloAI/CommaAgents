import type { z } from "zod/v4";
import { defineChannel, defineCommand } from "../../daemon-plugin";
import type { CommandContext, ChannelContext } from "../../daemon-plugin";
import type { ProjectsPlugin } from "./projects.types";
import {
  ArchiveProjectChatSchema,
  AssignProjectChatSchema,
  CreateProjectResultSchema,
  CreateProjectSchema,
  EmptyProjectArgumentsSchema,
  ProjectActivitySchema,
  ProjectCatalogSchema,
  ProjectChatStatusSchema,
  ProjectWatchMessageSchema,
  RestoreProjectChatSchema,
  SearchProjectArchiveResultSchema,
  SearchProjectArchiveSchema,
} from "./projects.schemas";

/**
 * Serialize native dates only at the JSON protocol boundary, then validate wire output.
 * @param {Schema} schema - Validated JSON response shape.
 * @param {unknown} value - Service result containing native dates.
 * @returns {z.output<Schema>} Validated JSON response.
 */
function wire<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  return schema.parse(JSON.parse(JSON.stringify(value)));
}
const listProjectsCommand = defineCommand({
  name: "projects.list",
  arguments: EmptyProjectArgumentsSchema,
  output: ProjectCatalogSchema,
  async handle({
    plugin,
  }: CommandContext<ProjectsPlugin, unknown, Record<string, never>>) {
    return wire(ProjectCatalogSchema, await plugin.list());
  },
});
const createProjectCommand = defineCommand({
  name: "projects.create",
  arguments: CreateProjectSchema,
  output: CreateProjectResultSchema,
  async handle({
    plugin,
    arguments: options,
  }: CommandContext<
    ProjectsPlugin,
    unknown,
    z.output<typeof CreateProjectSchema>
  >) {
    return wire(CreateProjectResultSchema, await plugin.create(options));
  },
});
const assignProjectChatCommand = defineCommand({
  name: "projects.assign",
  arguments: AssignProjectChatSchema,
  output: ProjectChatStatusSchema,
  async handle({
    plugin,
    arguments: options,
  }: CommandContext<
    ProjectsPlugin,
    unknown,
    z.output<typeof AssignProjectChatSchema>
  >) {
    return wire(ProjectChatStatusSchema, await plugin.assign(options));
  },
});
const projectActivityCommand = defineCommand({
  name: "projects.activity",
  arguments: ProjectActivitySchema,
  output: ProjectChatStatusSchema,
  async handle({
    plugin,
    arguments: options,
  }: CommandContext<
    ProjectsPlugin,
    unknown,
    z.output<typeof ProjectActivitySchema>
  >) {
    return wire(ProjectChatStatusSchema, await plugin.activity(options));
  },
});
const archiveProjectChatCommand = defineCommand({
  name: "projects.archive",
  arguments: ArchiveProjectChatSchema,
  output: ProjectChatStatusSchema,
  async handle({
    plugin,
    arguments: options,
  }: CommandContext<
    ProjectsPlugin,
    unknown,
    z.output<typeof ArchiveProjectChatSchema>
  >) {
    return wire(ProjectChatStatusSchema, await plugin.archive(options));
  },
});
const restoreProjectChatCommand = defineCommand({
  name: "projects.restore",
  arguments: RestoreProjectChatSchema,
  output: ProjectChatStatusSchema,
  async handle({
    plugin,
    arguments: { runId },
  }: CommandContext<
    ProjectsPlugin,
    unknown,
    z.output<typeof RestoreProjectChatSchema>
  >) {
    return wire(ProjectChatStatusSchema, await plugin.restore(runId));
  },
});
const searchProjectArchiveCommand = defineCommand({
  name: "projects.search",
  arguments: SearchProjectArchiveSchema,
  output: SearchProjectArchiveResultSchema,
  async handle({
    plugin,
    arguments: options,
  }: CommandContext<
    ProjectsPlugin,
    unknown,
    z.output<typeof SearchProjectArchiveSchema>
  >) {
    return wire(SearchProjectArchiveResultSchema, await plugin.search(options));
  },
});
export const projectCommands = [
  listProjectsCommand,
  createProjectCommand,
  assignProjectChatCommand,
  projectActivityCommand,
  archiveProjectChatCommand,
  restoreProjectChatCommand,
  searchProjectArchiveCommand,
];
export const projectWatchChannel = defineChannel({
  name: "projects.watch",
  arguments: EmptyProjectArgumentsSchema,
  message: ProjectWatchMessageSchema,
  async open({
    plugin,
    channel,
  }: CommandContext<ProjectsPlugin, unknown, Record<string, never>> & {
    readonly channel: ChannelContext<z.input<typeof ProjectWatchMessageSchema>>;
  }) {
    let cleanup: (() => void) | undefined;
    const release = () => cleanup?.();
    channel.signal.addEventListener("abort", release, { once: true });
    try {
      cleanup = await plugin.watch((catalog) => {
        if (!channel.signal.aborted) {
          channel.send({
            type: "projects.updated",
            data: wire(ProjectCatalogSchema, catalog),
          });
        }
      });
      if (channel.signal.aborted) {
        cleanup();
      }
      return {
        cleanup: () => {
          channel.signal.removeEventListener("abort", release);
          cleanup?.();
        },
      };
    } catch (error) {
      channel.signal.removeEventListener("abort", release);
      cleanup?.();
      throw error;
    }
  },
});
