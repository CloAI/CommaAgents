// Client → Daemon: list_flows
// Request a list of available and running flows.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const ListFlowsMessage = ClientBase.extend({
  type: z.literal("list_flows"),
});

export type ListFlowsMessage = z.infer<typeof ListFlowsMessage>;
