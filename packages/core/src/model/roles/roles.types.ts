/** Model identifiers keyed by role name, e.g. `{ medium: "openai/gpt-5", simple: "openai/gpt-5-mini" }`. */
export type ModelRoles = Readonly<Record<string, string>>;

/** A role offered for configuration, with what it is used for. */
export interface ModelRoleDefinition {
  readonly name: string;
  readonly description: string;
}

/** Sources consulted when an agent's model is a role reference such as `@medium`. */
export interface ModelRoleSources {
  /** User-configured roles; these win over strategy defaults. */
  readonly configured?: ModelRoles;
  /** Defaults declared by the strategy file. */
  readonly defaults?: ModelRoles;
}

/** Coarse model lineage used to select small prompt adjustments. */
export type ModelFamily = "claude" | "gpt" | "gemini" | "other";
