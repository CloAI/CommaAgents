// Tests for domain error classes

import { describe, expect, it } from "bun:test";
import {
  AgentCallError,
  CommaAgentsError,
  FlowExecutionError,
  HookExecutionError,
  ModelResolutionError,
  StrategyValidationError,
  ToolExecutionError,
} from "./index";

describe("CommaAgentsError", () => {
  it("should set name, code, and message", () => {
    const err = new CommaAgentsError("TEST_CODE", "test message");
    expect(err.name).toBe("CommaAgentsError");
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("test message");
    expect(err).toBeInstanceOf(Error);
  });

  it("should support cause via ErrorOptions", () => {
    const cause = new Error("root cause");
    const err = new CommaAgentsError("TEST", "wrapped", { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("ModelResolutionError", () => {
  it("should set modelString and correct code", () => {
    const err = new ModelResolutionError("openai/gpt-5", "Provider not found");
    expect(err.name).toBe("ModelResolutionError");
    expect(err.code).toBe("MODEL_RESOLUTION_ERROR");
    expect(err.modelString).toBe("openai/gpt-5");
    expect(err.message).toBe("Provider not found");
    expect(err).toBeInstanceOf(CommaAgentsError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("AgentCallError", () => {
  it("should set agentName and correct code", () => {
    const err = new AgentCallError("writer", "LLM call failed");
    expect(err.name).toBe("AgentCallError");
    expect(err.code).toBe("AGENT_CALL_ERROR");
    expect(err.agentName).toBe("writer");
  });
});

describe("FlowExecutionError", () => {
  it("should set flowName and correct code", () => {
    const err = new FlowExecutionError("review-pipeline", "Step 3 failed");
    expect(err.name).toBe("FlowExecutionError");
    expect(err.code).toBe("FLOW_EXECUTION_ERROR");
    expect(err.flowName).toBe("review-pipeline");
  });
});

describe("ToolExecutionError", () => {
  it("should set toolName and correct code", () => {
    const err = new ToolExecutionError("weather", "API timeout");
    expect(err.name).toBe("ToolExecutionError");
    expect(err.code).toBe("TOOL_EXECUTION_ERROR");
    expect(err.toolName).toBe("weather");
  });
});

describe("StrategyValidationError", () => {
  it("should set correct code", () => {
    const err = new StrategyValidationError("Invalid flow type");
    expect(err.name).toBe("StrategyValidationError");
    expect(err.code).toBe("STRATEGY_VALIDATION_ERROR");
  });
});

describe("HookExecutionError", () => {
  it("should set hookName and correct code", () => {
    const err = new HookExecutionError("beforeCall", "Hook threw");
    expect(err.name).toBe("HookExecutionError");
    expect(err.code).toBe("HOOK_EXECUTION_ERROR");
    expect(err.hookName).toBe("beforeCall");
  });
});

describe("Error hierarchy", () => {
  it("all domain errors should extend CommaAgentsError", () => {
    const errors = [
      new ModelResolutionError("x/y", "msg"),
      new AgentCallError("a", "msg"),
      new FlowExecutionError("f", "msg"),
      new ToolExecutionError("t", "msg"),
      new StrategyValidationError("msg"),
      new HookExecutionError("h", "msg"),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(CommaAgentsError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});
