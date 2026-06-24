import { describe, expect, it } from "bun:test";

import { formatDaemonLogPayload } from "./useDaemon.utils";

describe("formatDaemonLogPayload", () => {
  it("should preserve protocol identifiers while truncating long agent content", () => {
    const formatted = formatDaemonLogPayload({
      type: "agent_output",
      requestId: "request-123",
      text: "a".repeat(300),
    });

    expect(formatted).toContain('"type":"agent_output"');
    expect(formatted).toContain('"requestId":"request-123"');
    expect(formatted).toContain("… (300 chars)");
    expect(formatted.length).toBeLessThan(400);
  });

  it("should redact credential fields at every nesting level", () => {
    const formatted = formatDaemonLogPayload({
      type: "set_credential",
      apiKey: "top-secret",
      customData: { password: "nested-secret" },
      metadata: { oauthToken: "oauth-secret" },
    });

    expect(formatted).not.toContain("top-secret");
    expect(formatted).not.toContain("nested-secret");
    expect(formatted).not.toContain("oauth-secret");
    expect(formatted).toContain('"apiKey":"[redacted]"');
    expect(formatted).toContain('"customData":"[redacted]"');
    expect(formatted).toContain('"oauthToken":"[redacted]"');
  });

  it("should bound large arrays and circular payloads", () => {
    const payload: Record<string, unknown> = {
      records: Array.from({ length: 15 }, (_, index) => index),
    };
    payload.self = payload;

    const formatted = formatDaemonLogPayload(payload);

    expect(formatted).toContain("[5 more entries]");
    expect(formatted).toContain('"self":"[circular]"');
  });
});
