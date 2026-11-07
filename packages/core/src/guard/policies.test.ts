import { describe, expect, it } from "vitest";
import { forbiddenGlobsPolicy, pathPolicy } from "./policies";

describe("pathPolicy", () => {
  it("should apply wildcard allow and deny rules to the workspace root", () => {
    const allowRoot = pathPolicy(
      "read",
      { allow: ["*"], default: "deny" },
      "/workspace",
    );
    const denyRoot = pathPolicy(
      "read",
      { deny: ["*"], default: "allow" },
      "/workspace",
    );
    expect(
      allowRoot.evaluate({ type: "fs.read", resource: "/workspace" }),
    ).toBe("allow");
    expect(denyRoot.evaluate({ type: "fs.read", resource: "/workspace" })).toBe(
      "deny",
    );
  });

  it("should keep wildcard deny rules effective for hidden paths", () => {
    const policy = pathPolicy(
      "read",
      { deny: ["**/*"], default: "allow" },
      "/workspace",
    );
    expect(
      policy.evaluate({ type: "fs.read", resource: "/workspace/.env" }),
    ).toBe("deny");
    expect(
      policy.evaluate({ type: "fs.read", resource: "/workspace/.git/config" }),
    ).toBe("deny");
  });
});

describe("forbiddenGlobsPolicy", () => {
  it("should preserve mandatory denial for dotenv files and private keys", () => {
    const policy = forbiddenGlobsPolicy(["**/.env*", "**/*.pem"], "/workspace");
    expect(
      policy.evaluate({ type: "fs.read", resource: "/workspace/.env.local" }),
    ).toBe("deny");
    expect(
      policy.evaluate({
        type: "fs.write",
        resource: "/workspace/keys/private.pem",
      }),
    ).toBe("deny");
    expect(
      policy.evaluate({ type: "fs.read", resource: "/workspace/src/index.ts" }),
    ).toBe("pass");
  });
});
