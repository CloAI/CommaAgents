import { describe, expect, it } from "bun:test";
import { createSystemRunContext } from "../systems.test.utils";
import { createInputSystem } from "./input";

describe("createInputSystem", () => {
  it("collects and resolves input through the system", async () => {
    const context = createSystemRunContext();
    const system = createInputSystem();
    system.onRunPrepare?.(context);

    const collector = context.systemData.get("inputCollector");
    if (!collector) throw new Error("Input collector was not registered");

    const result = collector({
      agentName: "user",
      prompt: "What next?",
    });

    expect(context.sink.broadcasts[0]?.message.type).toBe("request_input");
    expect(
      context.actions.invoke(
        "resolveInput",
        context.run.id,
        "user",
        "continue",
      ),
    ).toBe(true);
    expect(await result).toBe("continue");
  });

  it("rejects pending input and unregisters actions during cleanup", async () => {
    const context = createSystemRunContext();
    const system = createInputSystem();
    system.onRunPrepare?.(context);

    const collector = context.systemData.get("inputCollector");
    if (!collector) throw new Error("Input collector was not registered");
    const result = collector({ agentName: "user", prompt: "What next?" });

    await system.onRunCleanup?.(context);

    await expect(result).rejects.toThrow("Input system cleaned up");
    expect(
      context.actions.invoke(
        "resolveInput",
        context.run.id,
        "user",
        "continue",
      ),
    ).toBe(false);
  });

  it("rejects pending input when the run is aborted", async () => {
    const context = createSystemRunContext();
    const system = createInputSystem();
    system.onRunPrepare?.(context);

    const collector = context.systemData.get("inputCollector");
    if (!collector) throw new Error("Input collector was not registered");
    const result = collector({ agentName: "user", prompt: "What next?" });

    context.run.abortController.abort();

    await expect(result).rejects.toThrow("Run aborted");
  });
});
