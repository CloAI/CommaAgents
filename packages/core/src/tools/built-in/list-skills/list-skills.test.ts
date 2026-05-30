import { describe, expect, it } from "bun:test";

import { createSandbox } from "../../../sandbox/sandbox";
import { PERMISSIVE_SANDBOX_CONFIG } from "../../../sandbox/sandbox.constants";
import { createSkillRegistry } from "../../../skills/skills.registry";
import type { ToolContext } from "../../tool.types";
import { createListSkillsTool } from "./list-skills";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    agentName: "test-agent",
    abort: new AbortController().signal,
    sandbox: createSandbox(PERMISSIVE_SANDBOX_CONFIG),
    ...overrides,
  };
}

describe("createListSkillsTool", () => {
  it("should return skill_unavailable when no registry is configured", async () => {
    const tool = createListSkillsTool();
    const result = await tool.execute({}, makeContext());
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("skill_unavailable");
    expect(result.error?.recoverable).toBe(false);
  });

  it("should return empty list when registry is empty", async () => {
    const registry = createSkillRegistry();
    const tool = createListSkillsTool();
    const result = await tool.execute(
      {},
      makeContext({ skillRegistry: registry }),
    );
    expect(result.ok).toBe(true);
    expect(result.data?.count).toBe(0);
    expect(result.data?.skills).toEqual([]);
    expect(result.output).toContain("No skills are currently registered.");
  });

  it("should list all registered skills sorted by name", async () => {
    const registry = createSkillRegistry();
    registry.register({
      name: "z-skill",
      description: "Last alphabetically.",
      content: "z body",
      sourcePath: "/z",
      origin: "global",
    });
    registry.register({
      name: "a-skill",
      description: "First alphabetically.",
      content: "a body",
      sourcePath: "/a",
      origin: "project",
    });
    const tool = createListSkillsTool();
    const result = await tool.execute(
      {},
      makeContext({ skillRegistry: registry }),
    );
    expect(result.ok).toBe(true);
    expect(result.data?.count).toBe(2);
    expect(result.data?.skills[0]?.name).toBe("a-skill");
    expect(result.data?.skills[1]?.name).toBe("z-skill");
    expect(result.output).toContain("a-skill (project): First alphabetically.");
    expect(result.output).toContain("z-skill (global): Last alphabetically.");
  });

  it("should return only metadata, not content", async () => {
    const registry = createSkillRegistry();
    registry.register({
      name: "my-skill",
      description: "A skill.",
      content: "# Full markdown body\nSome content.",
      sourcePath: "/path/SKILL.md",
      origin: "project",
    });
    const tool = createListSkillsTool();
    const result = await tool.execute(
      {},
      makeContext({ skillRegistry: registry }),
    );
    expect(result.ok).toBe(true);
    expect(result.data?.count).toBe(1);
    const entry = result.data?.skills[0];
    expect(entry).toBeDefined();
    if (!entry) throw new Error("Expected one skill entry");
    expect(entry.name).toBe("my-skill");
    expect(entry.description).toBe("A skill.");
    expect(entry.origin).toBe("project");
    expect(entry.sourcePath).toBe("/path/SKILL.md");
    expect((entry as Record<string, unknown>).content).toBeUndefined();
    expect(result.output).not.toContain("Full markdown body");
  });
});
