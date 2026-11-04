import { LAYOUT_STORAGE_KEY } from "./layout.storage";
import type { Layout } from "./layout.types";

/**
 * Give a story its own saved layout, restoring the real one afterward.
 * @param {Layout} [seed] - Layout to start from; omitted starts with none saved.
 * @returns {() => void} Restores the previous saved layout.
 */
export function isolateLayoutStorage(seed?: Layout): () => void {
  const previous = localStorage.getItem(LAYOUT_STORAGE_KEY);
  if (seed === undefined) {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
  } else {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ version: 1, ...seed }),
    );
  }
  return () => {
    if (previous === null) {
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
    } else {
      localStorage.setItem(LAYOUT_STORAGE_KEY, previous);
    }
  };
}
