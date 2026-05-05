import { filterByQuery } from "../SearchInput/SearchInput.utils";
import type { Command } from "./CommandPalette.types";

/** Build the searchable haystack for a command: label + description + keywords. */
function commandHaystack(command: Command): string {
  return [command.label, command.description, ...(command.keywords ?? [])].join(" ");
}

/**
 * Filter the command registry to entries that match a free-text query.
 * Delegates to `filterByQuery` with a command-specific haystack function.
 */
export function filterCommands(
  commands: readonly Command[],
  query: string,
): readonly Command[] {
  return filterByQuery(commands, query, commandHaystack);
}
