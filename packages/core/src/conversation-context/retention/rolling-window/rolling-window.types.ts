/** Configuration for rolling active records out of the LLM-visible context. */
export interface RollingWindowOptions {
  /** Maximum active records kept visible to the model. */
  readonly maxRecords: number;
}
