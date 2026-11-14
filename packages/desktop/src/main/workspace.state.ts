import { z } from "zod/v4";
import {
  dockPane,
  extractPane,
  listPanes,
  parseLayout,
} from "@comma-agents/ui/workspace";
import type { LayoutState } from "@comma-agents/ui/workspace";

const id = z.string().min(1);
const zone = z.enum(["left", "right", "top", "bottom"]);
const coordinate = z.number().int().min(-100_000).max(100_000);

/** Validated client presentation, separate from daemon project data. */
export const LayoutStateSchema = z.object({
  layout: z.unknown().transform((value, context) => {
    const parsed = parseLayout(
      JSON.stringify({
        version: 1,
        ...(typeof value === "object" && value !== null ? value : {}),
      }),
    );
    if (!parsed) {
      context.addIssue({ code: "custom", message: "Invalid layout" });
      return z.NEVER;
    }
    return parsed;
  }),
  strategyChoices: z.record(z.string(), z.string()),
  paneCollections: z
    .record(
      z.string(),
      z.object({
        paneId: id,
        chatIds: z.array(id),
        selectedChatId: id.optional(),
        draftId: id.optional(),
        closed: z.boolean(),
      }),
    )
    .optional(),
  maximizedId: id.optional(),
});

/** Client workspace persistence accepted from the main renderer. */
export const ClientWorkspaceStoreSchema = z.object({
  activeProjectId: id,
  workspaces: z.record(
    z.string(),
    z.object({
      projectId: id,
      state: LayoutStateSchema,
      windowStates: z.array(LayoutStateSchema).optional(),
    }),
  ),
});

/** Only supported, validated operations may cross the preload bridge. */
export const WorkspaceCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("newChatInPane"),
    runId: id,
    paneId: id,
    projectId: id,
  }),
  z.object({
    type: z.literal("revealChat"),
    runId: id,
    paneId: id,
    projectId: id,
  }),
  z.object({
    type: z.literal("switchProject"),
    projectId: id,
    state: LayoutStateSchema,
  }),
  z.object({
    type: z.literal("saveClientWorkspaces"),
    value: ClientWorkspaceStoreSchema,
  }),
  z.object({ type: z.literal("busy"), paneId: id, pending: z.boolean() }),
  z.object({
    type: z.literal("layout"),
    action: z.discriminatedUnion("type", [
      z.object({ type: z.literal("replace"), state: LayoutStateSchema }),
      z.object({ type: z.literal("restore"), paneId: id, runId: id }),
      z.object({ type: z.literal("newChat"), id }),
      z.object({
        type: z.literal("split"),
        id,
        direction: z.enum(["row", "column"]),
      }),
      z.object({ type: z.literal("close"), id }),
      z.object({ type: z.literal("move"), sourceId: id, targetId: id, zone }),
      z.object({ type: z.literal("activate"), id }),
      z.object({
        type: z.literal("path"),
        id,
        path: z.string().startsWith("/"),
      }),
      z.object({
        type: z.literal("sizes"),
        splitId: id,
        sizes: z.array(z.number().positive()),
      }),
      z.object({ type: z.literal("maximize"), id }),
      z.object({ type: z.literal("drag"), id: id.optional() }),
      z.object({ type: z.literal("strategy"), paneId: id, path: z.string() }),
    ]),
  }),
  z.object({
    type: z.literal("detach"),
    paneId: id,
    x: coordinate.optional(),
    y: coordinate.optional(),
  }),
  z.object({ type: z.literal("return") }),
  z.object({ type: z.literal("close") }),
  z.object({ type: z.literal("dock"), targetId: z.string(), zone }),
  z.object({ type: z.literal("cancelDock") }),
  z.object({ type: z.literal("drag"), paneId: id.optional() }),
  z.object({
    type: z.literal("endDrag"),
    paneId: id,
    x: coordinate,
    y: coordinate,
    cancelled: z.boolean(),
  }),
]);

/** Versioned desktop project layouts and window ownership. */
export const SavedWorkspaceSchema = z.object({
  version: z.literal(2),
  clientWorkspaces: ClientWorkspaceStoreSchema,
  windows: z
    .array(
      z.object({
        id,
        projectId: id,
        state: LayoutStateSchema,
        placement: z
          .object({
            x: coordinate.optional(),
            y: coordinate.optional(),
            width: z.number().int().min(480),
            height: z.number().int().min(360),
            maximized: z.boolean(),
          })
          .optional(),
      }),
    )
    .superRefine((windows, context) => {
      if (windows.filter((window) => window.id === "main").length !== 1) {
        context.addIssue({ code: "custom", message: "Missing main window" });
      }
      const windowIds = new Set<string>();
      const paneIds = new Set<string>();
      for (const window of windows) {
        if (windowIds.has(window.id)) {
          context.addIssue({ code: "custom", message: "Duplicate window" });
        }
        windowIds.add(window.id);
        for (const pane of listPanes(window.state.layout.root)) {
          const paneKey = `${window.projectId}:${pane.id}`;
          if (paneIds.has(paneKey)) {
            context.addIssue({
              code: "custom",
              message: "Duplicate pane ownership",
            });
          }
          paneIds.add(paneKey);
        }
      }
    }),
});

/**
 * Transfer a chat and its strategy without restarting its daemon execution.
 * @param {LayoutState} source - Source window state.
 * @param {LayoutState} target - Destination window state.
 * @param {string} paneId - Chat to transfer.
 * @param {string} targetId - Destination pane.
 * @param {"left" | "right" | "top" | "bottom"} zone - Destination edge.
 * @returns {{source: LayoutState, target: LayoutState} | undefined} Updated windows, or undefined when the destination is invalid.
 */
export function transferChat(
  source: LayoutState,
  target: LayoutState,
  paneId: string,
  targetId: string,
  zone: "left" | "right" | "top" | "bottom",
): { readonly source: LayoutState; readonly target: LayoutState } | undefined {
  const pane = listPanes(source.layout.root).find(
    (candidate) => candidate.id === paneId,
  );
  if (!pane) {
    return undefined;
  }
  const layout = dockPane(target.layout, pane, targetId, zone);
  if (layout === target.layout) {
    return undefined;
  }
  const choices = { ...source.strategyChoices };
  delete choices[paneId];
  const selected = source.strategyChoices[paneId];
  return {
    source: {
      layout: extractPane(source.layout, paneId),
      strategyChoices: choices,
      paneCollections: Object.fromEntries(
        Object.entries(source.paneCollections ?? {}).filter(
          ([collectionId]) => collectionId !== paneId,
        ),
      ),
    },
    target: {
      ...target,
      layout,
      paneCollections: {
        ...target.paneCollections,
        ...(source.paneCollections?.[paneId]
          ? { [paneId]: source.paneCollections[paneId] }
          : {}),
      },
      strategyChoices: {
        ...target.strategyChoices,
        ...(selected === undefined ? {} : { [paneId]: selected }),
      },
    },
  };
}
