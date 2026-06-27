import { describe, expect, it } from "bun:test";

import { createSandbox } from "../../../sandbox/sandbox";
import { PERMISSIVE_SANDBOX_CONFIG } from "../../../sandbox/sandbox.constants";
import { createSkillRegistry } from "../../../skills/skills.registry";
import type { ToolContext } from "../../tool.types";
import { createLoadSkillTool } from "./index";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    agentName: "test-agent",
    abort: new AbortController().signal,
    guard: createSandbox(PERMISSIVE_SANDBOX_CONFIG).guardFor("test-tool"),
    ...overrides,
  };
}

describe("createLoadSkillTool", () => {
  it("should return skill_unavailable when no registry is configured", async () => {
    const tool = createLoadSkillTool();
    const result = await tool.execute({ name: "anything" }, makeContext());
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("skill_unavailable");
  });

  it("should return not_found with available names when the name is unknown", async () => {
    const registry = createSkillRegistry();
    registry.register({
      name: "ts-patterns",
      description: "TypeScript rules.",
      content: "body",
      sourcePath: "/x",
      origin: "global",
    });
    const tool = createLoadSkillTool();
    const result = await tool.execute(
      { name: "missing-skill" },
      makeContext({ skillRegistry: registry }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
    expect(result.error?.message).toContain("ts-patterns");
    expect(result.error?.recoverable).toBe(true);
  });

  it("should return the full skill body on a successful load", async () => {
    const registry = createSkillRegistry();
    registry.register({
      name: "ts-patterns",
      description: "TypeScript rules.",
      content: "# Conventions\nFollow these rules.",
      sourcePath: "/abs/SKILL.md",
      origin: "project",
    });
    const tool = createLoadSkillTool();
    const result = await tool.execute(
      { name: "ts-patterns" },
      makeContext({ skillRegistry: registry }),
    );
    expect(result.ok).toBe(true);
    expect(result.data?.content).toBe("# Conventions\nFollow these rules.");
    expect(result.data?.origin).toBe("project");
    expect(result.output).toContain('Loaded skill "ts-patterns"');
    expect(result.output).toContain("# Conventions");
  });
});
