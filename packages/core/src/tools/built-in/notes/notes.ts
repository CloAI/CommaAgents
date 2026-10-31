import { z } from "zod";

import { defineTool } from "../../define/define-tool";
import { okResult } from "../../result";
import type { ToolContext, ToolDefinition } from "../../tool.types";
import type { NotesData, ResearchNote } from "./notes.types";

// Notes are process-global and keyed like todos: by run when the runtime supplies one,
// so each research worker's child run keeps its own evidence log.
const notesStore = new Map<string, ResearchNote[]>();

function notesFor(
  toolContext: Pick<ToolContext, "agentName" | "runId">,
): ResearchNote[] {
  const key = toolContext.runId ?? toolContext.agentName;
  let notes = notesStore.get(key);
  if (!notes) {
    notes = [];
    notesStore.set(key, notes);
  }
  return notes;
}

/**
 * Clear every run's notes. Exposed for tests.
 * @returns {void}
 */
export function resetAllNotes(): void {
  notesStore.clear();
}

const notesAddParams = z.object({
  claim: z
    .string()
    .min(1)
    .describe("The claim this source supports, stated in one sentence."),
  url: z.string().url().describe("URL of the page the evidence comes from."),
  quote: z
    .string()
    .optional()
    .describe("Exact passage from the page that supports the claim."),
  title: z.string().optional().describe("Page title."),
});

/**
 * Create the `notes_add` tool, which records one claim with its source while researching.
 *
 * @returns {ToolDefinition<typeof notesAddParams>} The tool definition.
 * @example
 * ```ts
 * registerTool("notes_add", createNotesAddTool());
 * ```
 */
export function createNotesAddTool(): ToolDefinition<typeof notesAddParams> {
  return defineTool({
    description:
      "Record one piece of evidence: a claim, the URL that supports it, and ideally an exact quote. " +
      "Add a note as soon as you read something you will rely on, so evidence survives long research sessions.",
    parameters: notesAddParams,
    execute: async ({ claim, url, quote, title }, toolContext) => {
      const notes = notesFor(toolContext);
      const note: ResearchNote = {
        id: notes.length + 1,
        claim,
        url,
        ...(quote ? { quote } : {}),
        ...(title ? { title } : {}),
        recordedAt: new Date().toISOString(),
      };
      notes.push(note);
      return okResult(`Recorded note #${note.id}.`, {
        metadata: { id: note.id, total: notes.length },
      });
    },
  });
}

const notesGetParams = z.object({});

/**
 * Create the `notes_get` tool, which returns every note recorded in this run as JSON.
 *
 * @returns {ToolDefinition<typeof notesGetParams, NotesData>} The tool definition.
 * @example
 * ```ts
 * registerTool("notes_get", createNotesGetTool());
 * ```
 */
export function createNotesGetTool(): ToolDefinition<
  typeof notesGetParams,
  NotesData
> {
  return defineTool<typeof notesGetParams, NotesData>({
    description:
      "Return every note recorded with notes_add in this run, as a JSON array.",
    parameters: notesGetParams,
    execute: async (_validatedArguments, toolContext) => {
      const notes = notesFor(toolContext);
      return okResult<NotesData>(JSON.stringify(notes, null, 2), {
        data: { notes },
      });
    },
  });
}
