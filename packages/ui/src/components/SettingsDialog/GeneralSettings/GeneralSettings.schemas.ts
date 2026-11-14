import { z } from "zod";
import { validateDaemonUrl } from "../../../settings";

export const generalSettingsSchema = z.object({
  url: z.string().superRefine((value, context) => {
    const message = validateDaemonUrl(value);
    if (message) {
      context.addIssue({ code: "custom", message });
    }
  }),
});
