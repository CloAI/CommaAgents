import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { z } from "zod";

import { createFlow } from "../flow/flow";
import {
  defineFlowType,
  getRegisteredFlowNames,
  registerFlow,
  resetFlowRegistry,
  unregisterFlow,
} from "./flow-registry";

afterEach(() => {
  resetFlowRegistry();
});

describe("flow registry", () => {
  it("should register and unregister a typed flow definition", () => {
    const definition = defineFlowType({
      configSchema: z.object({ marker: z.string() }).strict(),
      create: ({ name, steps, config }) =>
        createFlow({
          name,
          steps,
          execute: async (_steps, message) => `${config.marker}${message}`,
        }),
    });

    registerFlow("marked", definition);
    expect(getRegisteredFlowNames()).toEqual(["marked"]);
    expect(unregisterFlow("marked")).toBe(true);
    expect(getRegisteredFlowNames()).toEqual([]);
  });

  it("should warn when replacing a registered flow", () => {
    const warning = spyOn(console, "warn").mockImplementation(() => {});
    const definition = defineFlowType({
      configSchema: z.object({}).strict(),
      create: ({ name, steps }) =>
        createFlow({
          name,
          steps,
          execute: async (_steps, message) => message,
        }),
    });

    registerFlow("custom", definition);
    registerFlow("custom", definition);

    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0]?.[0]).toContain(
      "overriding previously registered flow",
    );
    warning.mockRestore();
  });
});
