// Tests for the list_providers request schema validation.

import { describe, expect, test } from "bun:test";
import { ListProvidersMessage } from "./list-providers.schema";

describe("ListProvidersMessage", () => {
  test("accepts minimal request", () => {
    const parsed = ListProvidersMessage.safeParse({ type: "list_providers" });
    expect(parsed.success).toBe(true);
  });

  test("accepts request with scope", () => {
    const parsed = ListProvidersMessage.safeParse({
      type: "list_providers",
      scope: "my-strategy",
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts request with live flag", () => {
    const parsed = ListProvidersMessage.safeParse({
      type: "list_providers",
      live: true,
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts request with requestId", () => {
    const parsed = ListProvidersMessage.safeParse({
      type: "list_providers",
      requestId: "req-1",
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects wrong type", () => {
    const parsed = ListProvidersMessage.safeParse({ type: "ping" });
    expect(parsed.success).toBe(false);
  });

  test("rejects non-string scope", () => {
    const parsed = ListProvidersMessage.safeParse({
      type: "list_providers",
      scope: 123,
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects non-boolean live", () => {
    const parsed = ListProvidersMessage.safeParse({
      type: "list_providers",
      live: "yes",
    });
    expect(parsed.success).toBe(false);
  });
});
