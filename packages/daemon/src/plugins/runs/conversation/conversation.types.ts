import type { z } from "zod/v4";
import type { ConversationEventSchema } from "./conversation.schemas";
/** @internal Canonical records and changes to effective model context. */
export type ConversationEvent = z.infer<typeof ConversationEventSchema>;
