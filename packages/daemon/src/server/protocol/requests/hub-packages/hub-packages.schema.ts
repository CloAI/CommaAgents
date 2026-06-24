import { z } from "zod";

import { ClientBase } from "../../shared";

export const HubListMessage = ClientBase.extend({
  type: z.literal("hub_list"),
});
export const HubInstallMessage = ClientBase.extend({
  type: z.literal("hub_install"),
  name: z.string().min(1),
  allowCode: z.boolean().optional(),
});
export const HubUpdateMessage = ClientBase.extend({
  type: z.literal("hub_update"),
  name: z.string().min(1),
  allowCode: z.boolean().optional(),
});
export const HubRemoveMessage = ClientBase.extend({
  type: z.literal("hub_remove"),
  name: z.string().min(1),
});

export type HubListMessage = z.infer<typeof HubListMessage>;
export type HubInstallMessage = z.infer<typeof HubInstallMessage>;
export type HubUpdateMessage = z.infer<typeof HubUpdateMessage>;
export type HubRemoveMessage = z.infer<typeof HubRemoveMessage>;
