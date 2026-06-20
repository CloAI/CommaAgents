export function resolveSelfDaemonCommand(): string[] {
  if (process.env.COMMA_STANDALONE_BUILD === "1") {
    return [process.execPath, "daemon"];
  }

  const cliEntrypoint = process.argv[1];
  if (cliEntrypoint === undefined) {
    throw new Error("Unable to resolve the comma CLI entrypoint");
  }
  return [process.execPath, "run", cliEntrypoint, "daemon"];
}
