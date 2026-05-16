/** TODO: Why does it cost so much slop just to search for a string??? tf */

/**
 * Split a query into whitespace-separated tokens (lowercased, trimmed).
 * Returns an empty array when the query is empty or whitespace-only.
 */
export function tokenizeQuery(query: string): readonly string[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/);
}

/**
 * Token-match predicate: returns `true` when every token in `query` appears
 * (case-insensitively) somewhere in `haystack`.
 *
 * Cheap, non-ranked, "every token must be found" semantics — appropriate
 * for small in-memory lists where a linear scan is fast enough to feel
 * instant and ranked matching adds no practical value.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return true;
  const lowered = haystack.toLowerCase();
  return tokens.every((token) => lowered.includes(token));
}

/**
 * Filter a list of items by a query, where each item projects to a searchable
 * haystack string via `getHaystack`. The filter is stable — it preserves the
 * original order of the matching items.
 */
export function filterByQuery<ItemType>(
  items: readonly ItemType[],
  query: string,
  getHaystack: (item: ItemType) => string,
): readonly ItemType[] {
  if (tokenizeQuery(query).length === 0) return items;
  return items.filter((item) => matchesQuery(getHaystack(item), query));
}

export { isMouseEscape } from "../../utils/mouseEscape";
