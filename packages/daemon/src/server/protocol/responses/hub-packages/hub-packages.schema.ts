import { type HubPackage, HubPackageSchema } from "@comma-agents/core/hub";
import { z } from "zod";

import { DaemonBase } from "../../shared";

export const InstalledHubPackageSchema = z.object({
  name: z.string(),
  version: z.string(),
  commit: z.string(),
  path: z.string(),
  executableCodeApproved: z.boolean(),
});

const WireHubPackageSchema = HubPackageSchema.transform(
  (value): HubPackage => value,
);

export const HubPackagesMessage = DaemonBase.extend({
  type: z.literal("hub_packages"),
  operation: z.enum(["list", "install", "update", "remove"]),
  available: z.array(WireHubPackageSchema).optional(),
  installed: z.array(InstalledHubPackageSchema).optional(),
  installedPackage: InstalledHubPackageSchema.optional(),
  removed: z.boolean().optional(),
});

export type HubPackagesMessage = z.infer<typeof HubPackagesMessage>;
