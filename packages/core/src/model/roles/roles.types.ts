/** Model identifiers keyed by role name, e.g. `{ primary: "openai/gpt-5", fast: "openai/gpt-5-mini" }`. */
export type ModelRoles = Readonly<Record<string, string>>;

/** Sources consulted when an agent's model is a role reference such as `@primary`. */
export interface ModelRoleSources {
  /** User-configured roles; these win over strategy defaults. */
  readonly configured?: ModelRoles;
  /** Defaults declared by the strategy file. */
  readonly defaults?: ModelRoles;
}

/** Coarse model lineage used to select small prompt adjustments. */
export type ModelFamily = "claude" | "gpt" | "gemini" | "other";
