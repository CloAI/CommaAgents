// Client → Daemon: list_strategies
// Request a list of available and running strategies.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const ListStrategiesMessage = ClientBase.extend({
  type: z.literal("list_strategies"),
});

export type ListStrategiesMessage = z.infer<typeof ListStrategiesMessage>;
