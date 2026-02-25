// Tests for all client → daemon message schemas.

import { describe, expect, test } from "bun:test";
import {
  ClientMessage,
  ListFlowsMessage,
  PingMessage,
  ProvideAuthMessage,
  parseClientMessage,
  StartFlowMessage,
  StopFlowMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  UserInputMessage,
} from "./client";

// ---------------------------------------------------------------------------
// Individual message schemas
// ---------------------------------------------------------------------------

describe("StartFlowMessage", () => {
  test("parses valid message", () => {
    const msg = { type: "start_flow", strategyPath: "/path/to/strategy.json" };
    expect(StartFlowMessage.parse(msg)).toEqual(msg);
  });

  test("accepts optional input", () => {
    const msg = { type: "start_flow", strategyPath: "/path.json", input: "hello" };
    expect(StartFlowMessage.parse(msg).input).toBe("hello");
  });

  test("accepts optional requestId", () => {
    const msg = { type: "start_flow", strategyPath: "/path.json", requestId: "req-1" };
    expect(StartFlowMessage.parse(msg).requestId).toBe("req-1");
  });

  test("rejects missing strategyPath", () => {
    expect(StartFlowMessage.safeParse({ type: "start_flow" }).success).toBe(false);
  });

  test("rejects empty strategyPath", () => {
    expect(StartFlowMessage.safeParse({ type: "start_flow", strategyPath: "" }).success).toBe(
      false,
    );
  });

  test("rejects wrong type literal", () => {
    expect(StartFlowMessage.safeParse({ type: "stop_flow", strategyPath: "/p" }).success).toBe(
      false,
    );
  });
});

describe("StopFlowMessage", () => {
  test("parses valid message", () => {
    const msg = { type: "stop_flow", runId: "run-1" };
    expect(StopFlowMessage.parse(msg)).toEqual(msg);
  });

  test("rejects missing runId", () => {
    expect(StopFlowMessage.safeParse({ type: "stop_flow" }).success).toBe(false);
  });

  test("rejects empty runId", () => {
    expect(StopFlowMessage.safeParse({ type: "stop_flow", runId: "" }).success).toBe(false);
  });
});

describe("UserInputMessage", () => {
  test("parses valid message", () => {
    const msg = { type: "user_input", runId: "run-1", agentName: "user-agent", text: "hello" };
    expect(UserInputMessage.parse(msg)).toEqual(msg);
  });

  test("accepts empty text (user can send empty string)", () => {
    const msg = { type: "user_input", runId: "run-1", agentName: "ua", text: "" };
    expect(UserInputMessage.parse(msg).text).toBe("");
  });

  test("rejects missing agentName", () => {
    expect(UserInputMessage.safeParse({ type: "user_input", runId: "r", text: "hi" }).success).toBe(
      false,
    );
  });

  test("rejects missing text", () => {
    expect(
      UserInputMessage.safeParse({ type: "user_input", runId: "r", agentName: "a" }).success,
    ).toBe(false);
  });
});

describe("ProvideAuthMessage", () => {
  test("parses valid message with API key credential", () => {
    const msg = {
      type: "provide_auth",
      providerId: "openai",
      credential: { type: "api", key: "sk-123" },
      persist: true,
    };
    const parsed = ProvideAuthMessage.parse(msg);
    expect(parsed.credential).toEqual({ type: "api", key: "sk-123" });
    expect(parsed.persist).toBe(true);
    expect(parsed.scope).toBe("$global"); // default
  });

  test("parses valid message with OAuth credential", () => {
    const msg = {
      type: "provide_auth",
      providerId: "github-copilot",
      credential: {
        type: "oauth",
        accessToken: "gho_abc123",
        refreshToken: "ghr_xyz789",
        expiresAt: "2026-03-01T12:00:00.000Z",
        accountId: "user42",
      },
      scope: "my-strategy",
      persist: true,
    };
    const parsed = ProvideAuthMessage.parse(msg);
    expect(parsed.credential.type).toBe("oauth");
    expect(parsed.scope).toBe("my-strategy");
  });

  test("parses valid message with custom credential", () => {
    const msg = {
      type: "provide_auth",
      providerId: "custom-llm",
      credential: { type: "custom", data: { token: "abc", region: "us-east-1" } },
      scope: "$global",
      persist: false,
    };
    const parsed = ProvideAuthMessage.parse(msg);
    expect(parsed.credential.type).toBe("custom");
  });

  test("defaults scope to $global when omitted", () => {
    const msg = {
      type: "provide_auth",
      providerId: "openai",
      credential: { type: "api", key: "sk-123" },
      persist: false,
    };
    expect(ProvideAuthMessage.parse(msg).scope).toBe("$global");
  });

  test("accepts explicit scope", () => {
    const msg = {
      type: "provide_auth",
      providerId: "openai",
      credential: { type: "api", key: "sk-123" },
      scope: "my-strategy",
      persist: false,
    };
    expect(ProvideAuthMessage.parse(msg).scope).toBe("my-strategy");
  });

  test("rejects missing providerId", () => {
    expect(
      ProvideAuthMessage.safeParse({
        type: "provide_auth",
        credential: { type: "api", key: "sk-123" },
        persist: true,
      }).success,
    ).toBe(false);
  });

  test("rejects missing credential", () => {
    expect(
      ProvideAuthMessage.safeParse({ type: "provide_auth", providerId: "openai", persist: true })
        .success,
    ).toBe(false);
  });

  test("rejects missing persist", () => {
    expect(
      ProvideAuthMessage.safeParse({
        type: "provide_auth",
        providerId: "openai",
        credential: { type: "api", key: "sk-123" },
      }).success,
    ).toBe(false);
  });

  test("rejects empty API key", () => {
    expect(
      ProvideAuthMessage.safeParse({
        type: "provide_auth",
        providerId: "openai",
        credential: { type: "api", key: "" },
        persist: true,
      }).success,
    ).toBe(false);
  });

  test("rejects unknown credential type", () => {
    expect(
      ProvideAuthMessage.safeParse({
        type: "provide_auth",
        providerId: "openai",
        credential: { type: "unknown", key: "abc" },
        persist: true,
      }).success,
    ).toBe(false);
  });

  test("rejects empty scope", () => {
    expect(
      ProvideAuthMessage.safeParse({
        type: "provide_auth",
        providerId: "openai",
        credential: { type: "api", key: "sk-123" },
        scope: "",
        persist: true,
      }).success,
    ).toBe(false);
  });
});

describe("ListFlowsMessage", () => {
  test("parses valid message", () => {
    expect(ListFlowsMessage.parse({ type: "list_flows" })).toEqual({ type: "list_flows" });
  });

  test("accepts optional requestId", () => {
    const msg = { type: "list_flows", requestId: "req-3" };
    expect(ListFlowsMessage.parse(msg).requestId).toBe("req-3");
  });
});

describe("SubscribeMessage", () => {
  test("parses valid message", () => {
    expect(SubscribeMessage.parse({ type: "subscribe", runId: "run-1" })).toEqual({
      type: "subscribe",
      runId: "run-1",
    });
  });

  test("rejects missing runId", () => {
    expect(SubscribeMessage.safeParse({ type: "subscribe" }).success).toBe(false);
  });
});

describe("UnsubscribeMessage", () => {
  test("parses valid message", () => {
    expect(UnsubscribeMessage.parse({ type: "unsubscribe", runId: "run-1" })).toEqual({
      type: "unsubscribe",
      runId: "run-1",
    });
  });

  test("rejects missing runId", () => {
    expect(UnsubscribeMessage.safeParse({ type: "unsubscribe" }).success).toBe(false);
  });
});

describe("PingMessage", () => {
  test("parses valid message", () => {
    expect(PingMessage.parse({ type: "ping" })).toEqual({ type: "ping" });
  });

  test("accepts optional requestId", () => {
    expect(PingMessage.parse({ type: "ping", requestId: "req-4" }).requestId).toBe("req-4");
  });
});

// ---------------------------------------------------------------------------
// ClientMessage discriminated union
// ---------------------------------------------------------------------------

describe("ClientMessage union", () => {
  test("routes start_flow correctly", () => {
    const result = ClientMessage.parse({ type: "start_flow", strategyPath: "/p.json" });
    expect(result.type).toBe("start_flow");
  });

  test("routes stop_flow correctly", () => {
    const result = ClientMessage.parse({ type: "stop_flow", runId: "r" });
    expect(result.type).toBe("stop_flow");
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

  test("routes provide_auth correctly", () => {
    const result = ClientMessage.parse({
      type: "provide_auth",
      providerId: "p",
      credential: { type: "api", key: "k" },
      persist: true,
    });
    expect(result.type).toBe("provide_auth");
  });

  test("routes list_flows correctly", () => {
    const result = ClientMessage.parse({ type: "list_flows" });
    expect(result.type).toBe("list_flows");
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
    expect(ClientMessage.safeParse({ type: "unknown_msg" }).success).toBe(false);
  });

  test("rejects missing type", () => {
    expect(ClientMessage.safeParse({ runId: "r" }).success).toBe(false);
  });

  test("rejects empty object", () => {
    expect(ClientMessage.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseClientMessage helper
// ---------------------------------------------------------------------------

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
