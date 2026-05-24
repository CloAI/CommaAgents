import { z } from "zod";
import { ClientBase } from "../../shared";
import { handleGetRun } from "./handler";

export const GetRunMessage = ClientBase.extend({
  type: z.literal("get_run"),
  runId: z.string(),
});

export type GetRunMessage = z.infer<typeof GetRunMessage>;

export { handleGetRun };
