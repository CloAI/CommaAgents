import { describe, expect, it } from "vitest";
import { createSearchSkillsTool } from "./search-skills";
import { createSkillRegistry } from "../../../skills/skills.registry";
import { createSandbox } from "../../../sandbox/sandbox";
import { PERMISSIVE_SANDBOX_OPTIONS } from "../../../sandbox/sandbox.constants";

describe("search_skills", () => {
  it("should find candidates in the supplied snapshot without returning their bodies", async () => {
    const registry = createSkillRegistry();
    registry.register({
      name: "typescript-review",
      description: "Review TypeScript changes.",
      content: "Full instructions",
      sourcePath: "/skills/review/SKILL.md",
      origin: "global",
    });
    const context = {
      agentName: "reviewer",
      abort: new AbortController().signal,
      guard: createSandbox(PERMISSIVE_SANDBOX_OPTIONS).guardFor(
        "search_skills",
      ),
      skillRegistry: registry,
    };
    const result = await createSearchSkillsTool().execute(
      { query: "typescrpt", limit: 10 },
      context,
    );
    expect(result.ok).toBe(true);
    expect(result.data?.matches[0]?.name).toBe("typescript-review");
    expect(JSON.stringify(result)).not.toContain("Full instructions");
    const unavailable = await createSearchSkillsTool().execute(
      { query: "review", limit: 10 },
      { ...context, skillRegistry: undefined },
    );
    expect(unavailable.error?.kind).toBe("skill_unavailable");
  });
});
