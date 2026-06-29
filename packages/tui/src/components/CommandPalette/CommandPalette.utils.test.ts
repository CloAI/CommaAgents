import { describe, expect, it } from "bun:test";
import type React from "react";
import type { Command } from "./CommandPalette.types";
import { filterCommands } from "./CommandPalette.utils";

const Page = (): React.ReactElement | null => null;

const commands: readonly Command[] = [
  {
    id: "new",
    label: "New run",
    description: "Start another strategy",
    keywords: ["create", "strategy"],
    page: Page,
  },
  {
    id: "logs",
    label: "Open logs",
    description: "Inspect daemon output",
    page: Page,
  },
];

describe("filterCommands", () => {
  it("matches labels, descriptions, and keywords", () => {
    expect(filterCommands(commands, "new")).toEqual(commands.slice(0, 1));
    expect(filterCommands(commands, "daemon")).toEqual(commands.slice(1, 2));
    expect(filterCommands(commands, "create strategy")).toEqual(
      commands.slice(0, 1),
    );
  });

  it("returns all commands for an empty query", () => {
    expect(filterCommands(commands, "")).toEqual(commands);
  });
});
