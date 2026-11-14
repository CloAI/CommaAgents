import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { StatusContext, StatusPlugin } from "../../../status.types";
import {
  GetStatusArgumentsSchema,
  DaemonStatusSchema,
} from "./get-status.schemas";
export const getStatusCommand = defineCommand({
  name: "status.get",
  arguments: GetStatusArgumentsSchema,
  output: DaemonStatusSchema,
  handle({
    context,
  }: CommandContext<StatusPlugin, StatusContext, Record<string, never>>) {
    return context.snapshot;
  },
});
