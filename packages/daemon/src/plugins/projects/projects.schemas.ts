import { z } from "zod/v4";

const IdentifierSchema = z.string().min(1);
const TimestampSchema = z.iso.datetime();
export const ProjectSchema = z
  .object({
    projectId: IdentifierSchema,
    name: z.string().trim().min(1),
    cwd: z.string().min(1),
    createdAt: TimestampSchema,
  })
  .strict();
export const ProjectChatSchema = z
  .object({
    runId: IdentifierSchema,
    projectId: IdentifierSchema,
    title: z.string(),
    lastActivityAt: TimestampSchema,
    doneAt: TimestampSchema.optional(),
    archivedAt: TimestampSchema.optional(),
  })
  .strict();
export const ChatAttentionSchema = z
  .object({
    running: z.boolean(),
    question: z.boolean(),
    permission: z.boolean(),
    failed: z.boolean(),
  })
  .strict();
export const ProjectChatStatusSchema = ProjectChatSchema.extend({
  attention: ChatAttentionSchema,
  latestEntryId: IdentifierSchema.optional(),
}).strict();
export const ProjectCatalogSchema = z
  .object({
    projects: z.array(ProjectSchema),
    chats: z.array(ProjectChatStatusSchema),
  })
  .strict();
export const CreateProjectSchema = z
  .object({
    requestId: IdentifierSchema,
    name: z.string().trim().min(1),
    cwd: z.string().min(1),
    sourceProjectId: IdentifierSchema.optional(),
    mode: z.enum(["fresh", "copy", "move"]),
    runIds: z.array(IdentifierSchema).optional(),
    checkpoints: z.record(IdentifierSchema, IdentifierSchema).optional(),
  })
  .strict();
export const CreateProjectResultSchema = z
  .object({
    project: ProjectSchema,
    runIdMap: z.record(IdentifierSchema, IdentifierSchema),
  })
  .strict();
export const AssignProjectChatSchema = z
  .object({
    projectId: IdentifierSchema,
    runId: IdentifierSchema,
    title: z.string().optional(),
  })
  .strict();
export const ProjectActivitySchema = z
  .object({
    runId: IdentifierSchema,
    title: z.string().optional(),
  })
  .strict();
export const ArchiveProjectChatSchema = z
  .object({
    runId: IdentifierSchema,
    done: z.boolean().optional(),
  })
  .strict();
export const RestoreProjectChatSchema = z
  .object({ runId: IdentifierSchema })
  .strict();
export const SearchProjectArchiveSchema = z
  .object({
    projectId: IdentifierSchema,
    query: z.string().optional(),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .strict();
export const SearchProjectArchiveResultSchema = z
  .object({
    chats: z.array(ProjectChatStatusSchema),
    total: z.number().int().nonnegative(),
    nextOffset: z.number().int().nonnegative().optional(),
  })
  .strict();
export const ProjectWatchMessageSchema = z
  .object({
    type: z.literal("projects.updated"),
    data: ProjectCatalogSchema,
  })
  .strict();
export const EmptyProjectArgumentsSchema = z.object({}).strict();

export const SavedProjectsSchema = z
  .object({
    projects: z.array(ProjectSchema),
    chats: z.array(ProjectChatSchema),
    requests: z.array(
      z
        .object({
          requestId: IdentifierSchema,
          fingerprint: z.string(),
          targetRootIds: z.array(IdentifierSchema),
          result: CreateProjectResultSchema.optional(),
        })
        .strict(),
    ),
  })
  .strict();
