// Tests for all client → daemon message schemas.

import { describe, expect, test } from "bun:test";
import { ClientMessage, parseClientMessage } from "./messages";
import { ContinueRunMessage } from "./requests/continue-run/continue-run.schema";
import { ListStrategiesMessage } from "./requests/list-strategies/list-strategies.schema";
import { PingMessage } from "./requests/ping/ping.schema";
import { PrepareRunMessage } from "./requests/prepare-run/prepare-run.schema";
import { StartRunMessage } from "./requests/start-run/start-run.schema";
import { StopRunMessage } from "./requests/stop-run/stop-run.schema";
import { SubscribeMessage } from "./requests/subscribe/subscribe.schema";
import { UnsubscribeMessage } from "./requests/unsubscribe/unsubscribe.schema";
import { UserInputMessage } from "./requests/user-input/user-input.schema";

// Individual message schemas

describe("PrepareRunMessage", () => {
  test("parses valid message", () => {
    const msg = {
      type: "prepare_run",
      strategyPath: "/path/to/strategy.json",
    };
    expect(PrepareRunMessage.parse(msg)).toEqual(msg);
  });

  test("rejects input", () => {
    const msg = {
      type: "prepare_run",
      strategyPath: "/path.json",
      input: "hello",
    };
    expect(PrepareRunMessage.parse(msg)).not.toHaveProperty("input");
  });

  test("accepts a caller-selected runId", () => {
    const msg = {
      type: "prepare_run",
      runId: "run-stable",
      strategyPath: "/path.json",
    };
    expect(PrepareRunMessage.parse(msg).runId).toBe("run-stable");
  });

  test("accepts optional requestId", () => {
    const msg = {
      type: "prepare_run",
      strategyPath: "/path.json",
      requestId: "req-1",
    };
    expect(PrepareRunMessage.parse(msg).requestId).toBe("req-1");
  });

  test("accepts optional modelOverride", () => {
    const msg = {
      type: "prepare_run",
      strategyPath: "/path.json",
      modelOverride: "anthropic/claude-sonnet-4-20250514",
    };
    expect(PrepareRunMessage.parse(msg).modelOverride).toBe(
      "anthropic/claude-sonnet-4-20250514",
    );
  });

  test("rejects empty modelOverride", () => {
    expect(
      PrepareRunMessage.safeParse({
        type: "prepare_run",
        strategyPath: "/p.json",
        modelOverride: "",
      }).success,
    ).toBe(false);
  });

  test("accepts an existing runId without a strategyPath", () => {
    expect(
      PrepareRunMessage.parse({ type: "prepare_run", runId: "existing-run" }),
    ).toEqual({ type: "prepare_run", runId: "existing-run" });
  });

  test("rejects empty strategyPath", () => {
    expect(
      PrepareRunMessage.safeParse({
        type: "prepare_run",
        strategyPath: "",
      }).success,
    ).toBe(false);
  });

  test("rejects wrong type literal", () => {
    expect(
      PrepareRunMessage.safeParse({
        type: "stop_run",
        strategyPath: "/p",
      }).success,
    ).toBe(false);
  });
});

describe("StartRunMessage", () => {
  test("accepts optional input", () => {
    const msg = { type: "start_run", runId: "run-1", input: "hello" };
    expect(StartRunMessage.parse(msg)).toEqual(msg);
  });
});

describe("ContinueRunMessage", () => {
  test("requires a run id and input", () => {
    const msg = { type: "continue_run", runId: "run-1", input: "continue" };
    expect(ContinueRunMessage.parse(msg)).toEqual(msg);
    expect(
      ContinueRunMessage.safeParse({ type: "continue_run", runId: "run-1" })
        .success,
    ).toBe(false);
  });
});

describe("StopRunMessage", () => {
  test("parses valid message", () => {
    const msg = { type: "stop_run", runId: "run-1" };
    expect(StopRunMessage.parse(msg)).toEqual(msg);
  });

  test("rejects missing runId", () => {
    expect(StopRunMessage.safeParse({ type: "stop_run" }).success).toBe(false);
  });

  test("rejects empty runId", () => {
    expect(
      StopRunMessage.safeParse({ type: "stop_run", runId: "" }).success,
    ).toBe(false);
  });
});

describe("UserInputMessage", () => {
  test("parses valid message", () => {
    const msg = {
      type: "user_input",
      runId: "run-1",
      agentName: "user-agent",
      text: "hello",
    };
    expect(UserInputMessage.parse(msg)).toEqual(msg);
  });

  test("accepts empty text (user can send empty string)", () => {
    const msg = {
      type: "user_input",
      runId: "run-1",
      agentName: "ua",
      text: "",
    };
    expect(UserInputMessage.parse(msg).text).toBe("");
  });

  test("rejects missing agentName", () => {
    expect(
      UserInputMessage.safeParse({ type: "user_input", runId: "r", text: "hi" })
        .success,
    ).toBe(false);
  });

  test("rejects missing text", () => {
    expect(
      UserInputMessage.safeParse({
        type: "user_input",
        runId: "r",
        agentName: "a",
      }).success,
    ).toBe(false);
  });
});

describe("ListStrategiesMessage", () => {
  test("parses valid message", () => {
    expect(ListStrategiesMessage.parse({ type: "list_strategies" })).toEqual({
      type: "list_strategies",
    });
  });

  test("accepts optional requestId", () => {
    const msg = { type: "list_strategies", requestId: "req-3" };
    expect(ListStrategiesMessage.parse(msg).requestId).toBe("req-3");
  });
});

describe("SubscribeMessage", () => {
  test("parses valid message", () => {
    expect(
      SubscribeMessage.parse({ type: "subscribe", runId: "run-1" }),
    ).toEqual({
      type: "subscribe",
      runId: "run-1",
    });
  });

  test("rejects missing runId", () => {
    expect(SubscribeMessage.safeParse({ type: "subscribe" }).success).toBe(
      false,
    );
  });
});

describe("UnsubscribeMessage", () => {
  test("parses valid message", () => {
    expect(
      UnsubscribeMessage.parse({ type: "unsubscribe", runId: "run-1" }),
    ).toEqual({
      type: "unsubscribe",
      runId: "run-1",
    });
  });

  test("rejects missing runId", () => {
    expect(UnsubscribeMessage.safeParse({ type: "unsubscribe" }).success).toBe(
      false,
    );
  });
});

describe("PingMessage", () => {
  test("parses valid message", () => {
    expect(PingMessage.parse({ type: "ping" })).toEqual({ type: "ping" });
  });

  test("accepts optional requestId", () => {
    expect(
      PingMessage.parse({ type: "ping", requestId: "req-4" }).requestId,
    ).toBe("req-4");
  });
});

// ClientMessage discriminated union

describe("ClientMessage union", () => {
  test("routes prepare_run and start_run correctly", () => {
    const result = ClientMessage.parse({
      type: "prepare_run",
      strategyPath: "/p.json",
    });
    expect(result.type).toBe("prepare_run");
    expect(ClientMessage.parse({ type: "start_run", runId: "r" }).type).toBe(
      "start_run",
    );
  });

  test("routes continue_run and rejects empty prepare_run messages", () => {
    expect(
      ClientMessage.parse({
        type: "continue_run",
        runId: "r",
        input: "continue",
      }).type,
    ).toBe("continue_run");
    expect(ClientMessage.safeParse({ type: "prepare_run" }).success).toBe(
      false,
    );
  });

  test("rejects removed get_run messages", () => {
    expect(
      ClientMessage.safeParse({
        type: "get_run",
        runId: "r",
      }).success,
    ).toBe(false);
  });

  test("routes stop_run correctly", () => {
    const result = ClientMessage.parse({ type: "stop_run", runId: "r" });
    expect(result.type).toBe("stop_run");
  });

  test("rejects removed strategy lifecycle requests", () => {
    expect(
      ClientMessage.safeParse({
        type: "start_strategy",
        strategyPath: "/p.json",
      }).success,
    ).toBe(false);
    expect(
      ClientMessage.safeParse({ type: "stop_strategy", runId: "r" }).success,
    ).toBe(false);
  });

  test("routes user_input correctly", () => {
    const result = ClientMessage.parse({
      type: "user_input",
      runId: "r",
      agentName: "a",
      text: "t",
    });
    expect(result.type).toBe("user_input");
  });

  test("routes list_strategies correctly", () => {
    const result = ClientMessage.parse({ type: "list_strategies" });
    expect(result.type).toBe("list_strategies");
  });

  test("routes subscribe correctly", () => {
    const result = ClientMessage.parse({ type: "subscribe", runId: "r" });
    expect(result.type).toBe("subscribe");
  });

  test("routes unsubscribe correctly", () => {
    const result = ClientMessage.parse({ type: "unsubscribe", runId: "r" });
    expect(result.type).toBe("unsubscribe");
  });

  test("routes ping correctly", () => {
    const result = ClientMessage.parse({ type: "ping" });
    expect(result.type).toBe("ping");
  });

  test("rejects unknown type", () => {
    expect(ClientMessage.safeParse({ type: "unknown_msg" }).success).toBe(
      false,
    );
  });

  test("rejects missing type", () => {
    expect(ClientMessage.safeParse({ runId: "r" }).success).toBe(false);
  });

  test("rejects empty object", () => {
    expect(ClientMessage.safeParse({}).success).toBe(false);
  });
});

// parseClientMessage helper

describe("parseClientMessage", () => {
  test("returns success for valid message", () => {
    const result = parseClientMessage({ type: "ping" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("ping");
    }
  });

  test("returns failure for invalid message", () => {
    const result = parseClientMessage({ type: "bad" });
    expect(result.success).toBe(false);
  });

  test("handles non-object input", () => {
    expect(parseClientMessage("not json").success).toBe(false);
    expect(parseClientMessage(null).success).toBe(false);
    expect(parseClientMessage(42).success).toBe(false);
  });
});
