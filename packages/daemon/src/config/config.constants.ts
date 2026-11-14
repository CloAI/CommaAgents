import z from "zod";

const LogLevelSchema = z.enum([
  "trace",
  "debug",
  "info",
  "warn",
  "warning",
  "error",
  "fatal",
]);

/**
 * Validation schema for the daemon config file.
 * All fields are optional — missing fields use defaults.
 */
export const DaemonConfigFileSchema = z
  .object({
    port: z.number().int().min(1).max(65535).optional(),
    host: z.string().optional(),
    logLevel: LogLevelSchema.optional(),
    logFile: z.string().optional(),
    console: z.boolean().optional(),
    consoleFormat: z.enum(["text", "json"]).optional(),
    logPayloads: z.boolean().optional(),
    pidFile: z.string().optional(),
    configFile: z.string().optional(),
    runsDir: z.string().optional(),
    /** Models for `@role` references in strategies, e.g. `{ "primary": "openai/gpt-5" }`. */
    modelRoles: z.record(z.string().min(1), z.string().min(1)).optional(),
    /** Instruction file names checked per directory, first match wins. */
    instructionFiles: z.array(z.string().min(1)).optional(),
    /** Extra skill directories; relative paths use this configuration file's directory. */
    skills: z
      .object({
        additionalDirectories: z.array(z.string().trim().min(1)).default([]),
      })
      .strict()
      .optional(),
  })
  .strict();
