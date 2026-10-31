import type { z } from "zod/v4";
import type {
  CommandContext,
  ChannelContext,
} from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import type { RunsContext } from "../../../state/state.types";
import type { RunsArgumentsSchema, RunsMessageSchema } from "./runs.schemas";
/** Public message union carried by one run subscription. */
export type RunsChannelMessage = z.infer<typeof RunsMessageSchema>;
/** @internal Feature-owned initialization and live delivery. */
export type OpenRunsChannelOptions = CommandContext<
  RunsPlugin,
  RunsContext,
  z.output<typeof RunsArgumentsSchema>
> & {
  readonly channel: ChannelContext<
    z.input<typeof RunsMessageSchema> | z.output<typeof RunsMessageSchema>
  >;
};
