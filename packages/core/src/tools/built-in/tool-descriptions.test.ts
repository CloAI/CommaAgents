import { describe, expect, it } from "bun:test";
import { createApplyPatchTool } from "./apply-patch";
import { createCreateFileTool } from "./create-file";
import { createDeleteFileTool } from "./delete-file";
import { describeTool } from "./describe-tool";
import { createEditFileTool } from "./edit-file";
import { createGlobTool } from "./glob";
import { createListDirectoryTool } from "./list-directory";
import { createMoveFileTool } from "./move-file";
import { createReadFileTool } from "./read-file";
import { createRunCommandTool, type PlatformInfo } from "./run-command";
import { createSearchFilesTool } from "./search-files";
import { createWriteFileTool } from "./write-file";

const FIXED_PLATFORM: PlatformInfo = {
  platform: "linux",
  osName: "Linux",
  osRelease: "TEST",
  arch: "x64",
  shellPath: "/bin/sh",
  shellFlag: "-c",
  runtime: "bun TEST",
};

describe("describeTool", () => {
  it("renders sections in the canonical order", () => {
    const text = describeTool({
      purpose: "Demo purpose.",
      inputs: [
        {
          name: "a",
          type: "string",
          required: true,
          description: "first arg.",
        },
        {
          name: "b",
          type: "number",
          required: false,
          defaultValue: "0",
          description: "second arg.",
        },
      ],
      outputs: "`{ ok }`.",
      errors: [
        { kind: "not_found", description: "thing missing." },
        { kind: "unknown", description: "fallback." },
      ],
      examples: ["one liner."],
      notes: ["a note."],
    });

    // Section ordering: purpose → Inputs → Outputs → Errors → Examples → Notes.
    const inputsIdx = text.indexOf("Inputs:");
    const outputsIdx = text.indexOf("Outputs (`data`):");
    const errorsIdx = text.indexOf("Errors:");
    const examplesIdx = text.indexOf("Examples:");
    const notesIdx = text.indexOf("Notes:");
    expect(inputsIdx).toBeGreaterThan(0);
    expect(outputsIdx).toBeGreaterThan(inputsIdx);
    expect(errorsIdx).toBeGreaterThan(outputsIdx);
    expect(examplesIdx).toBeGreaterThan(errorsIdx);
    expect(notesIdx).toBeGreaterThan(examplesIdx);

    // Input formatting and default rendering.
    expect(text).toContain("`a` (string, required) — first arg.");
    expect(text).toContain("`b` (number, optional, default 0) — second arg.");
    // Error formatting.
    expect(text).toContain("- `not_found` — thing missing.");
  });

  it("omits Examples and Notes sections when not provided", () => {
    const text = describeTool({
      purpose: "Bare.",
      inputs: [],
      outputs: "`{}`.",
      errors: [],
    });
    expect(text).not.toContain("Examples:");
    expect(text).not.toContain("Notes:");
    expect(text).toContain("Inputs:\n  (none)");
    expect(text).toContain("Errors:\n  (none)");
  });
});

describe("built-in tool descriptions", () => {
  it("read_file description", () => {
    expect(createReadFileTool().description).toMatchSnapshot();
  });

  it("list_directory description", () => {
    expect(createListDirectoryTool().description).toMatchSnapshot();
  });

  it("search_files description", () => {
    expect(createSearchFilesTool().description).toMatchSnapshot();
  });

  it("glob description", () => {
    expect(createGlobTool().description).toMatchSnapshot();
  });

  it("create_file description", () => {
    expect(createCreateFileTool().description).toMatchSnapshot();
  });

  it("write_file description", () => {
    expect(createWriteFileTool().description).toMatchSnapshot();
  });

  it("edit_file description", () => {
    expect(createEditFileTool().description).toMatchSnapshot();
  });

  it("delete_file description", () => {
    expect(createDeleteFileTool().description).toMatchSnapshot();
  });

  it("move_file description", () => {
    expect(createMoveFileTool().description).toMatchSnapshot();
  });

  it("apply_patch description", () => {
    expect(createApplyPatchTool().description).toMatchSnapshot();
  });

  it("run_command description", () => {
    expect(
      createRunCommandTool({ platformInfo: FIXED_PLATFORM }).description,
    ).toMatchSnapshot();
  });

  it("every built-in description contains all four canonical sections", () => {
    const descriptions: ReadonlyArray<{ name: string; text: string }> = [
      { name: "read_file", text: createReadFileTool().description },
      { name: "list_directory", text: createListDirectoryTool().description },
      { name: "search_files", text: createSearchFilesTool().description },
      { name: "glob", text: createGlobTool().description },
      { name: "create_file", text: createCreateFileTool().description },
      { name: "write_file", text: createWriteFileTool().description },
      { name: "edit_file", text: createEditFileTool().description },
      { name: "delete_file", text: createDeleteFileTool().description },
      { name: "move_file", text: createMoveFileTool().description },
      { name: "apply_patch", text: createApplyPatchTool().description },
      {
        name: "run_command",
        text: createRunCommandTool({ platformInfo: FIXED_PLATFORM })
          .description,
      },
    ];

    for (const { name, text } of descriptions) {
      expect(text, `${name}: missing Inputs section`).toContain("Inputs:");
      expect(text, `${name}: missing Outputs section`).toContain(
        "Outputs (`data`):",
      );
      expect(text, `${name}: missing Errors section`).toContain("Errors:");
    }
  });
});
