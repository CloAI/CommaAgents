/**
 * Read the route an address-bar hash names.
 * @param {string} hash - `location.hash`, such as "#/runs/abc".
 * @returns {string | undefined} The route, or undefined when the hash is empty or not a route.
 */
export function pathFromHash(hash: string): string | undefined {
  const path = hash.startsWith("#") ? hash.slice(1) : hash;
  return path.startsWith("/") ? path : undefined;
}

/**
 * Build the address-bar hash that names a route.
 * @param {string} path - Route such as "/runs/abc".
 * @returns {string} The hash, such as "#/runs/abc".
 */
export function hashFromPath(path: string): string {
  return `#${path}`;
}
