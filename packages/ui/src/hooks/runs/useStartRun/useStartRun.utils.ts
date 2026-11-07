import { z } from "zod";
import type { DaemonFailure } from "../../useDaemonMutation/useDaemonMutation.types";

const RolesSchema = z.array(z.string()).min(1);

/**
 * Read the roles a failed preparation reported as missing.
 * @param {DaemonFailure} failure - Failure with code `MISSING_MODEL_ROLES`.
 * @returns {string[] | undefined} Role names, or undefined when the daemon sent none.
 */
export function missingRolesFrom(failure: DaemonFailure): string[] | undefined {
  const metadata = "metadata" in failure ? failure.metadata : undefined;
  const parsed = RolesSchema.safeParse(metadata?.roles);
  return parsed.success ? parsed.data : undefined;
}
