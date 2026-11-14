import { useContext } from "react";
import { WorkspacesContext } from "./useWorkspaces.context";
/**
 * Access client workspace presentation and daemon chat membership.
 * @returns {WorkspacesContextValue} Workspace actions and the current project catalog.
 */
export function useWorkspaces() {
  const context = useContext(WorkspacesContext);
  if (!context) {
    throw new Error("useWorkspaces must be used within WorkspacesProvider.");
  }
  return context;
}
/**
 * Optional workspace scope for independently rendered chat stories and detached views.
 * @returns {WorkspacesContextValue | null} Workspace scope, or null for standalone previews.
 */
export function useOptionalWorkspaces() {
  return useContext(WorkspacesContext);
}
