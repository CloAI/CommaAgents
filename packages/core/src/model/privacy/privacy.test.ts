import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateText, jsonSchema } from "ai";
import {
  createCredentialStore,
  getGlobalCredentialStore,
  setGlobalCredentialStore,
} from "../../credentials";
import { createJsonFileCredentialBackend } from "../../credentials/backends/json-file";
import { getProviderDefinition } from "../providers/providers";
import { createPrivacyRuntime } from "./privacy";
import { PrivacyRequirementsSchema } from "./privacy.schemas";
import { readPrivacyBody } from "./privacy.utils";
import type { PrivacyEvent, PrivacyReport } from "./privacy.types";

const originalFetch = globalThis.fetch;
let previousStore: ReturnType<typeof getGlobalCredentialStore>;
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "comma-privacy-"));
  previousStore = getGlobalCredentialStore();
  await getProviderDefinition("venice");
  setGlobalCredentialStore(
    createCredentialStore({
      backend: createJsonFileCredentialBackend({
        filePath: join(directory, "credentials.json"),
      }),
      env: { VENICE_API_KEY: "private-test-key" },
    }),
  );
  await getGlobalCredentialStore().set("venice", "$global", {
    type: "api",
    key: "private-test-key",
  });
});
afterEach(async () => {
  globalThis.fetch = originalFetch;
  setGlobalCredentialStore(previousStore);
  await rm(directory, { recursive: true, force: true });
});

describe("createPrivacyRuntime", () => {
  it("should require TEE when E2EE is requested and reject weakening flags", () => {
    expect(
      PrivacyRequirementsSchema.safeParse({ tee: "required", e2ee: "required" })
        .success,
    ).toBe(true);
    expect(PrivacyRequirementsSchema.safeParse({}).success).toBe(true);
    for (const value of [
      { e2ee: "required" },
      { tee: false },
      { tee: "preferred" },
      { mode: "e2ee" },
    ])
      expect(PrivacyRequirementsSchema.safeParse(value).success).toBe(false);
  });

  it("should reject invalid trusted endpoints and resource limits", () => {
    for (const options of [
      { pccsURL: "http://untrusted.test" },
      { nrasURL: "https://key:secret@example.test" },
      { limits: { maxWireBytes: 0 } },
      { limits: { requestTimeoutMs: Infinity } },
    ])
      expect(() => createPrivacyRuntime(options)).toThrow(
        "Invalid protection configuration",
      );
  });

  it("should reject providers without a code-owned protected transport", async () => {
    const fetchMock = spyOn(globalThis, "fetch");
    await expect(
      createPrivacyRuntime().resolveModel("custom/model", { tee: "required" }),
    ).rejects.toMatchObject({ code: "PRIVACY_UNSUPPORTED_PROVIDER" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should reject unsupported encrypted tools before any provider call", async () => {
    const fetchMock = spyOn(globalThis, "fetch");
    const model = await createPrivacyRuntime().resolveModel("venice/model", {
      tee: "required",
      e2ee: "required",
    });
    await expect(
      generateText({
        model,
        prompt: "private-prompt",
        maxRetries: 3,
        tools: {
          example: {
            description: "public-schema",
            inputSchema: jsonSchema({ type: "object", properties: {} }),
          },
        },
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_UNSUPPORTED_FEATURE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should reject unverified evidence without inference, retries, or leaked payloads", async () => {
    const events: PrivacyEvent[] = [];
    const reports: PrivacyReport[] = [];
    const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (input: Parameters<typeof fetch>[0]) => {
          const url = new URL(String(input));
          expect(url.pathname).toBe("/api/v1/tee/attestation");
          return Response.json({
            model: "model",
            nonce: url.searchParams.get("nonce"),
            intel_quote: "00",
            signing_key: `04${"00".repeat(64)}`,
            providerSecret: "do-not-leak",
          });
        },
        { preconnect: originalFetch.preconnect },
      ),
    );
    const model = await createPrivacyRuntime({
      onEvent: (event) => events.push(event),
    }).resolveModel(
      "venice/model",
      { tee: "required", e2ee: "required" },
      { onReport: (report) => reports.push(report) },
    );
    let failure: unknown;
    try {
      await generateText({ model, prompt: "private-prompt", maxRetries: 3 });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.phase)).toEqual([
      "preflight",
      "attestation",
      "rejected",
    ]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.status).toBe("rejected");
    const serialized = JSON.stringify({ failure, events, reports });
    for (const secret of ["private-prompt", "private-test-key", "do-not-leak"])
      expect(serialized).not.toContain(secret);
  });

  it("should reject observer failures before transmitting content", async () => {
    const fetchMock = spyOn(globalThis, "fetch");
    const model = await createPrivacyRuntime({
      onEvent: () => {
        throw new Error("observer-secret");
      },
    }).resolveModel("venice/model", { tee: "required" });
    await expect(
      generateText({ model, prompt: "private-prompt" }),
    ).rejects.toMatchObject({ code: "PRIVACY_CALLBACK_FAILED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("should reject asynchronous observers without detached rejection or network calls", async () => {
    const fetchMock = spyOn(globalThis, "fetch");
    const model = await createPrivacyRuntime({
      onEvent: async () => {
        throw new Error("observer-secret");
      },
    }).resolveModel("venice/model", { tee: "required" });
    await expect(
      generateText({ model, prompt: "private-prompt" }),
    ).rejects.toMatchObject({ code: "PRIVACY_CALLBACK_FAILED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should interrupt stalled body reads and enforce byte limits", async () => {
    await expect(
      readPrivacyBody(
        new Response("oversized"),
        2,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_LIMIT_EXCEEDED" });
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    );
    const controller = new AbortController();
    const reading = readPrivacyBody(response, 100, controller.signal);
    controller.abort("caller-secret");
    await expect(reading).rejects.toMatchObject({ code: "PRIVACY_CANCELLED" });
    expect(cancelled).toBe(true);
  });
});
