import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { z } from "zod";

import { createAgent } from "../agent/agent";
import {
  defineAgentType,
  getRegisteredAgentNames,
  registerAgent,
  resetAgentRegistry,
  resolveRegisteredAgent,
  unregisterAgent,
} from "./agent-registry";

afterEach(() => {
  resetAgentRegistry();
});

describe("agent registry", () => {
  it("should register, construct, and unregister a typed agent definition", async () => {
    registerAgent(
      "marked",
      defineAgentType({
        configSchema: z.object({ marker: z.string() }).strict(),
        create: async ({ name, config, runtime }) =>
          createAgent({
            name,
            execute: async (message) =>
              `${runtime.runId}:${config.marker}${message}`,
          }),
      }),
    );

    expect(getRegisteredAgentNames()).toEqual(["marked"]);
    const definition = resolveRegisteredAgent("marked");
    const agent = await definition?.create({
      name: "custom",
      config: { marker: ">" },
      runtime: { runId: "run-1" },
    });

    expect((await agent?.call("hello"))?.text).toBe("run-1:>hello");
    expect(unregisterAgent("marked")).toBe(true);
    expect(getRegisteredAgentNames()).toEqual([]);
  });

  it("should validate registered agent configuration", async () => {
    registerAgent(
      "marked",
      defineAgentType({
        configSchema: z.object({ marker: z.string() }).strict(),
        create: ({ name }) =>
          createAgent({ name, execute: async (message) => message }),
      }),
    );

    await expect(
      resolveRegisteredAgent("marked")?.create({
        name: "custom",
        config: { marker: 42 },
        runtime: {},
      }),
    ).rejects.toThrow("config.marker");
  });

  it("should warn when replacing a registered agent", () => {
    const warning = spyOn(console, "warn").mockImplementation(() => {});
    const definition = defineAgentType({
      configSchema: z.object({}).strict(),
      create: ({ name }) =>
        createAgent({ name, execute: async (message) => message }),
    });

    registerAgent("custom", definition);
    registerAgent("custom", definition);

    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0]?.[0]).toContain(
      "overriding previously registered agent",
    );
    warning.mockRestore();
  });

  it("should reject reserved built-in agent names", () => {
    const definition = defineAgentType({
      configSchema: z.object({}).strict(),
      create: ({ name }) =>
        createAgent({ name, execute: async (message) => message }),
    });

    expect(() => registerAgent("llm", definition)).toThrow(
      "reserved built-in agent type",
    );
    expect(() => registerAgent("user", definition)).toThrow(
      "reserved built-in agent type",
    );
  });
});
