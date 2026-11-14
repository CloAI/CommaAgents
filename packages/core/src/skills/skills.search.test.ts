import { describe, expect, it } from "vitest";
import { createSkillRegistry } from "./skills.registry";
import { searchSkills } from "./skills.search";

function registry() {
  const result = createSkillRegistry();
  for (const [name, description] of [
    ["typescript-review", "Review TypeScript changes."],
    ["react-patterns", "Build React components."],
    ["release", "Publish a package."],
  ]) {
    result.register({
      name: name!,
      description: description!,
      content: "Private instructions",
      sourcePath: `/skills/${name}/SKILL.md`,
      origin: "global",
    });
  }
  return result;
}

describe("skill fuzzy search", () => {
  it("should tolerate spelling mistakes and case while returning metadata only", () => {
    const result = searchSkills(registry(), { query: "TYPESCRPT" });
    expect(result.matches[0]?.name).toBe("typescript-review");
    expect(result.matches[0]?.score).toBeLessThan(0.5);
    expect(result.matches[0]).not.toHaveProperty("content");
    expect(JSON.stringify(result)).not.toContain("Private instructions");
  });
  it("should match descriptions and report the total before limiting", () => {
    const result = registry();
    result.register({
      name: "another",
      description: "Build React interfaces.",
      content: "body",
      sourcePath: "/another",
      origin: "project",
    });
    const matches = searchSkills(result, { query: "React", limit: 1 });
    expect(matches.matches).toHaveLength(1);
    expect(matches.totalMatches).toBe(2);
  });
  it("should return an empty success and reject invalid search arguments", () => {
    expect(searchSkills(registry(), { query: "zzzzzzzzzzzzzz" })).toEqual({
      matches: [],
      totalMatches: 0,
    });
    for (const options of [
      { query: " " },
      { query: "react", limit: 0 },
      { query: "react", limit: 51 },
    ]) {
      expect(() => searchSkills(registry(), options)).toThrow();
    }
  });
});
