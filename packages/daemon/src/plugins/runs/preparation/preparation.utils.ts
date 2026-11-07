/**
 * Layer newly chosen roles over a run's saved ones.
 * @param {Readonly<Record<string, string>> | undefined} saved - Roles already saved for the run.
 * @param {Readonly<Record<string, string>> | undefined} chosen - Roles to add or replace.
 * @returns {Record<string, string> | undefined} Combined roles, or undefined when neither has any.
 */
export function mergeModelRoles(
  saved: Readonly<Record<string, string>> | undefined,
  chosen: Readonly<Record<string, string>> | undefined,
): Record<string, string> | undefined {
  const merged = { ...saved, ...chosen };
  return Object.keys(merged).length === 0 ? undefined : merged;
}
