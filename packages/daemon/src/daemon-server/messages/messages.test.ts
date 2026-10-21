import { describe, expect, it } from "bun:test";
import {
  ClientMessageSchema,
  RequestIdSchema,
  ServerMessageSchema,
} from "./messages.schemas";

describe("plugin message schemas", () => {
  it("should require UUIDv4 IDs and accept only the three client operations", () => {
    const requestId = crypto.randomUUID();
    for (const message of [
      { type: "command", requestId, command: "status.get", arguments: {} },
      { type: "subscribe", requestId, channel: "status.watch", arguments: {} },
      { type: "unsubscribe", requestId },
    ]) {
      expect(ClientMessageSchema.safeParse(message).success).toBe(true);
    }
    for (const invalidId of [
      "",
      "request-1",
      "00000000-0000-0000-0000-000000000000",
      "550e8400-e29b-11d4-a716-446655440000",
    ]) {
      expect(RequestIdSchema.safeParse(invalidId).success).toBe(false);
    }
    expect(
      ClientMessageSchema.safeParse({
        type: "unsubscribe",
        requestId,
        targetRequestId: requestId,
      }).success,
    ).toBe(false);
    expect(
      ClientMessageSchema.safeParse({
        type: "command",
        requestId,
        command: "status.get",
        params: {},
      }).success,
    ).toBe(false);
  });

  it("should validate responses, channel events, and each termination reason", () => {
    const envelope = {
      requestId: crypto.randomUUID(),
      ts: new Date().toISOString(),
    };
    for (const message of [
      { ...envelope, type: "response", ok: true, data: null },
      {
        ...envelope,
        type: "response",
        ok: false,
        error: { code: "NOT_FOUND", message: "Missing" },
      },
      { ...envelope, type: "run.state", data: { phase: "running" } },
      { ...envelope, type: "subscription_end", reason: "completed" },
      { ...envelope, type: "subscription_end", reason: "unsubscribed" },
      {
        ...envelope,
        type: "subscription_end",
        reason: "failed",
        error: { code: "FAILED", message: "Failed" },
      },
    ]) {
      expect(ServerMessageSchema.safeParse(message).success).toBe(true);
    }
    expect(
      ServerMessageSchema.safeParse({
        ...envelope,
        type: "subscription_end",
        reason: "failed",
      }).success,
    ).toBe(false);
    expect(
      ServerMessageSchema.safeParse({
        ...envelope,
        type: "response",
        ok: true,
        data: Number.NaN,
      }).success,
    ).toBe(false);
  });
});
