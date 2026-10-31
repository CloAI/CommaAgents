/**
 * Name a pane after the route it shows.
 * @param {string} path - Route the pane shows.
 * @returns {string} "New chat" for the empty chat, "Run <short id>" for a run, otherwise the route.
 */
export function paneTitle(path: string): string {
  if (path === "/") return "New chat";
  const run = /^\/runs\/([^/]+)$/.exec(path);
  return run ? `Run ${run[1]!.slice(0, 8)}` : path;
}
