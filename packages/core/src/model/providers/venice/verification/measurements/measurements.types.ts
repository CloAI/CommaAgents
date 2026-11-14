import type { z } from "zod";
import type {
  ComposeManagerSchema,
  DstackEventSchema,
} from "./measurements.schemas";

/** Parsed dstack runtime/firmware log entry. @internal */
export type DstackEvent = z.output<typeof DstackEventSchema>;

/** Runtime deployment history whose quote must be independently verified. @internal */
export type ComposeManagerEvidence = z.output<typeof ComposeManagerSchema>;
