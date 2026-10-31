/** One piece of evidence recorded during research. */
export interface ResearchNote {
  /** Sequential identifier within the run, starting at 1. */
  readonly id: number;
  /** The claim this evidence supports, in the researcher's words. */
  readonly claim: string;
  /** Source URL. */
  readonly url: string;
  /** Exact supporting passage copied from the source, when available. */
  readonly quote?: string;
  /** Source page title, when known. */
  readonly title?: string;
  /** ISO-8601 time the note was recorded. */
  readonly recordedAt: string;
}

/** Structured payload returned by `notes_get.execute`. */
export interface NotesData {
  /** Every note recorded in this run, in order. */
  readonly notes: readonly ResearchNote[];
}
