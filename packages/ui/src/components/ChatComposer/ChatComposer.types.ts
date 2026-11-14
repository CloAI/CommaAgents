/** A composer notice with an explicit visual severity. */
export interface ChatComposerWarning {
  /** Notice shown above the input. */
  readonly message: string;
  /** Color used for this notice. */
  readonly severity: "warning" | "error";
}
