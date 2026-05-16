import { describe, expect, it } from "bun:test";
import {
  applyUpdateHunks,
  formatChangedFileLine,
  PatchApplyError,
  PatchParseError,
  parsePatchEnvelope,
} from "./apply-patch.utils";

describe("parsePatchEnvelope", () => {
  it("parses an empty patch envelope with no operations as an error", () => {
    expect(() =>
      parsePatchEnvelope(["*** Begin Patch", "*** End Patch", ""].join("\n")),
    ).toThrow(PatchParseError);
  });

  it("requires the begin marker", () => {
    try {
      parsePatchEnvelope("just some text");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PatchParseError);
      expect((err as PatchParseError).expected).toBe("*** Begin Patch");
    }
  });

  it("requires the end marker", () => {
    expect(() =>
      parsePatchEnvelope(
        ["*** Begin Patch", "*** Add File: a.txt", "+x"].join("\n"),
      ),
    ).toThrow(PatchParseError);
  });

  it("rejects content before the begin marker", () => {
    expect(() =>
      parsePatchEnvelope(
        ["preamble", "*** Begin Patch", "*** End Patch"].join("\n"),
      ),
    ).toThrow(PatchParseError);
  });

  it("rejects content after the end marker", () => {
    expect(() =>
      parsePatchEnvelope(
        [
          "*** Begin Patch",
          "*** Delete File: x",
          "*** End Patch",
          "trailing",
        ].join("\n"),
      ),
    ).toThrow(PatchParseError);
  });

  it("parses an Add File section into add content with trailing newline", () => {
    const plan = parsePatchEnvelope(
      [
        "*** Begin Patch",
        "*** Add File: notes.txt",
        "+hello",
        "+world",
        "*** End Patch",
      ].join("\n"),
    );
    expect(plan.operations).toHaveLength(1);
    const operation = plan.operations[0];
    if (operation?.kind !== "add") throw new Error("expected add");
    expect(operation.path).toBe("notes.txt");
    expect(operation.content).toBe("hello\nworld\n");
    expect(plan.hunkCount).toBe(0);
  });

  it("honors `\\ No newline at end of file` in Add File", () => {
    const plan = parsePatchEnvelope(
      [
        "*** Begin Patch",
        "*** Add File: nonl.txt",
        "+abc",
        "\\ No newline at end of file",
        "*** End Patch",
      ].join("\n"),
    );
    const operation = plan.operations[0];
    if (operation?.kind !== "add") throw new Error("expected add");
    expect(operation.content).toBe("abc");
  });

  it("rejects Add File bodies whose lines do not start with `+`", () => {
    expect(() =>
      parsePatchEnvelope(
        [
          "*** Begin Patch",
          "*** Add File: bad.txt",
          "no plus sign",
          "*** End Patch",
        ].join("\n"),
      ),
    ).toThrow(PatchParseError);
  });

  it("parses Update File with one hunk", () => {
    const plan = parsePatchEnvelope(
      [
        "*** Begin Patch",
        "*** Update File: src/foo.ts",
        "@@ optional header",
        " context",
        "-old",
        "+new",
        " more context",
        "*** End Patch",
      ].join("\n"),
    );
    expect(plan.operations).toHaveLength(1);
    const operation = plan.operations[0];
    if (operation?.kind !== "update") throw new Error("expected update");
    expect(operation.path).toBe("src/foo.ts");
    expect(operation.hunks).toHaveLength(1);
    expect(operation.hunks[0]?.header).toBe("optional header");
    expect(plan.hunkCount).toBe(1);
  });

  it("requires at least one hunk in Update File", () => {
    expect(() =>
      parsePatchEnvelope(
        ["*** Begin Patch", "*** Update File: a.ts", "*** End Patch"].join(
          "\n",
        ),
      ),
    ).toThrow(PatchParseError);
  });

  it("parses Delete File with no body", () => {
    const plan = parsePatchEnvelope(
      ["*** Begin Patch", "*** Delete File: old.ts", "*** End Patch"].join(
        "\n",
      ),
    );
    const operation = plan.operations[0];
    if (operation?.kind !== "delete") throw new Error("expected delete");
    expect(operation.path).toBe("old.ts");
  });

  it("parses Move File without hunks", () => {
    const plan = parsePatchEnvelope(
      ["*** Begin Patch", "*** Move File: a.ts -> b.ts", "*** End Patch"].join(
        "\n",
      ),
    );
    const operation = plan.operations[0];
    if (operation?.kind !== "move") throw new Error("expected move");
    expect(operation.fromPath).toBe("a.ts");
    expect(operation.toPath).toBe("b.ts");
    expect(operation.hunks).toHaveLength(0);
  });

  it("parses Move File with edits", () => {
    const plan = parsePatchEnvelope(
      [
        "*** Begin Patch",
        "*** Move File: a.ts -> b.ts",
        "@@",
        "-x",
        "+y",
        "*** End Patch",
      ].join("\n"),
    );
    const operation = plan.operations[0];
    if (operation?.kind !== "move") throw new Error("expected move");
    expect(operation.hunks).toHaveLength(1);
    expect(plan.hunkCount).toBe(1);
  });

  it("rejects Move File without the arrow", () => {
    expect(() =>
      parsePatchEnvelope(
        ["*** Begin Patch", "*** Move File: a.ts b.ts", "*** End Patch"].join(
          "\n",
        ),
      ),
    ).toThrow(PatchParseError);
  });

  it("rejects unknown section headers", () => {
    expect(() =>
      parsePatchEnvelope(
        ["*** Begin Patch", "*** Rename File: a -> b", "*** End Patch"].join(
          "\n",
        ),
      ),
    ).toThrow(PatchParseError);
  });

  it("supports multiple operations in one envelope", () => {
    const plan = parsePatchEnvelope(
      [
        "*** Begin Patch",
        "*** Add File: a.ts",
        "+content",
        "*** Update File: b.ts",
        "@@",
        " context",
        "-old",
        "+new",
        "*** Delete File: c.ts",
        "*** Move File: d.ts -> e.ts",
        "*** End Patch",
      ].join("\n"),
    );
    expect(plan.operations).toHaveLength(4);
    expect(plan.operations.map((op) => op.kind)).toEqual([
      "add",
      "update",
      "delete",
      "move",
    ]);
    expect(plan.hunkCount).toBe(1);
  });

  it("handles CRLF line endings in the envelope", () => {
    const plan = parsePatchEnvelope(
      ["*** Begin Patch", "*** Delete File: x", "*** End Patch"].join("\r\n"),
    );
    expect(plan.operations[0]?.kind).toBe("delete");
  });
});

describe("applyUpdateHunks", () => {
  it("applies a context-anchored hunk", () => {
    const source = "one\ntwo\nthree\nfour\n";
    const after = applyUpdateHunks("f.ts", source, [
      {
        header: "",
        sourceLine: 1,
        lines: [" one", "-two", "+TWO", " three"],
      },
    ]);
    expect(after).toBe("one\nTWO\nthree\nfour\n");
  });

  it("throws PatchApplyError with reason=context_not_found when context missing", () => {
    expect(() =>
      applyUpdateHunks("f.ts", "one\ntwo\n", [
        { header: "", sourceLine: 1, lines: [" zzz", "-yyy"] },
      ]),
    ).toThrow(PatchApplyError);
  });

  it("throws PatchApplyError with reason=multiple_matches when context occurs twice", () => {
    const source = "marker\nmarker\n";
    try {
      applyUpdateHunks("f.ts", source, [
        { header: "", sourceLine: 1, lines: ["-marker", "+changed"] },
      ]);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PatchApplyError);
      expect((err as PatchApplyError).reason).toBe("multiple_matches");
    }
  });

  it("applies multiple sequential hunks", () => {
    const source = "a\nb\nc\nd\ne\n";
    const after = applyUpdateHunks("f.ts", source, [
      { header: "", sourceLine: 1, lines: [" a", "-b", "+B"] },
      { header: "", sourceLine: 4, lines: [" c", "-d", "+D"] },
    ]);
    expect(after).toBe("a\nB\nc\nD\ne\n");
  });
});

describe("formatChangedFileLine", () => {
  it("formats add / update / delete / move with correct sigils", () => {
    expect(
      formatChangedFileLine({ path: "a", operation: "add", diff: "" }),
    ).toBe("  A a");
    expect(
      formatChangedFileLine({ path: "b", operation: "update", diff: "" }),
    ).toBe("  M b");
    expect(
      formatChangedFileLine({ path: "c", operation: "delete", diff: "" }),
    ).toBe("  D c");
    expect(
      formatChangedFileLine({
        path: "d",
        operation: "move",
        toPath: "e",
        diff: "",
      }),
    ).toBe("  R d -> e");
  });
});
