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
    pidFile: z.string().optional(),
    configFile: z.string().optional(),
    runsDir: z.string().optional(),
  })
  .strict();
