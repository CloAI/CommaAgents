import { afterEach, describe, expect, it } from "bun:test";

import { makeToolContext } from "../../test.utils";
import { createNotesAddTool, createNotesGetTool, resetAllNotes } from "./notes";

afterEach(resetAllNotes);

describe("notes tools", () => {
  it("should return notes recorded in the same run", async () => {
    const context = makeToolContext({ runId: "worker-1" });
    await createNotesAddTool().execute(
      {
        claim: "Bun 1.3 ships a SQL client.",
        url: "https://bun.sh/blog/bun-v1.3",
        quote: "Bun.SQL",
      },
      context,
    );
    const result = await createNotesGetTool().execute({}, context);

    expect(
      result.data?.notes.map((note) => [note.id, note.claim, note.quote]),
    ).toEqual([[1, "Bun 1.3 ships a SQL client.", "Bun.SQL"]]);
  });

  it("should keep each run's notes separate", async () => {
    await createNotesAddTool().execute(
      { claim: "A", url: "https://example.com/a" },
      makeToolContext({ runId: "worker-1" }),
    );
    const other = await createNotesGetTool().execute(
      {},
      makeToolContext({ runId: "worker-2" }),
    );

    expect(other.data?.notes).toEqual([]);
  });
});
