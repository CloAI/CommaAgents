import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateText, jsonSchema, streamText } from "ai";
import { createHash } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  createCredentialStore,
  getGlobalCredentialStore,
  setGlobalCredentialStore,
} from "../../credentials";
import { createJsonFileCredentialBackend } from "../../credentials/backends/json-file";
import {
  getProviderDefinition,
  registerProviderDefinition,
  unregisterProviderDefinition,
} from "../providers/providers";
import { createPrivacyRuntime } from "./privacy";
import { PrivacyRequirementsSchema } from "./privacy.schemas";
import * as verification from "../providers/venice/verification/verification";
import { readPrivacyBody, privacyError } from "./privacy.utils";
import type { PrivacyEvent, PrivacyReport } from "./privacy.types";
import {
  decryptVeniceChunk,
  encryptVeniceMessage,
  generateVeniceKeyPair,
} from "../providers/venice/venice.crypto";

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
  it.each([
    ["mismatched", undefined, "rejected"],
    ["mismatched", false, "rejected"],
    ["mismatched", true, "degraded"],
    ["streamed-mismatch", true, "degraded"],
    ["valid", true, "verified"],
    ["invalid-signature", true, "rejected"],
    ["wrong-id", true, "rejected"],
    ["wrong-model", true, "rejected"],
    ["malformed-hashes", true, "rejected"],
    ["hardware-failure", true, "rejected"],
    ["invalid-tool-envelope", true, "rejected"],
  ] as const)(
    "should handle %s receipts with allowUnboundReceipts=%s as %s",
    async (scenario, allowUnboundReceipts, status) => {
      const enclave = generateVeniceKeyPair();
      const reports: PrivacyReport[] = [];
      const events: PrivacyEvent[] = [];
      const hardware = vi.spyOn(
        verification,
        "verifyHardwareEvidence",
      ).mockImplementation(async () => {
        if (scenario === "hardware-failure") {
          throw privacyError("PRIVACY_ATTESTATION_FAILED");
        }
      });
      let receipt: unknown;
      const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
        Object.assign(
          async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
            const url = new URL(String(input));
            if (url.pathname.endsWith("/tee/attestation")) {
              return Response.json({
                model: "model",
                upstream_model: "upstream",
                verified: true,
                nonce: url.searchParams.get("nonce"),
                intel_quote: "00",
                signing_key: Buffer.from(enclave.publicKey).toString("hex"),
              });
            }
            if (url.pathname.endsWith("/chat/completions")) {
              const clientKey = Buffer.from(
                new Headers(init?.headers).get("x-venice-tee-client-pub-key")!,
                "hex",
              );
              const wire = `data: ${JSON.stringify({ id: "completion", model: "model", choices: [{ index: 0, delta: { content: encryptVeniceMessage(scenario === "invalid-tool-envelope" ? '<comma_tool_call>{"name":"unoffered","arguments":{}}' : "reply", clientKey) }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;
              const requestHash =
                scenario === "valid"
                  ? createHash("sha256")
                      .update(String(init?.body))
                      .digest("hex")
                  : "00".repeat(32);
              const responseHash =
                scenario === "valid"
                  ? createHash("sha256").update(wire).digest("hex")
                  : "11".repeat(32);
              const text =
                scenario === "malformed-hashes"
                  ? "not-a-hash-pair"
                  : `${scenario === "wrong-model" ? "wrong-model" : "upstream"}:${requestHash}:${responseHash}`;
              const digest = keccak_256(
                Buffer.concat([
                  Buffer.from(
                    `\x19Ethereum Signed Message:\n${Buffer.byteLength(text)}`,
                  ),
                  Buffer.from(text),
                ]),
              );
              const signed = secp256k1.sign(digest, enclave.privateKey, {
                prehash: false,
                format: "recovered",
              });
              const signature = Buffer.concat([
                signed.subarray(1),
                Buffer.from([signed[0]! + 27]),
              ]).toString("hex");
              receipt = {
                requested_request_id:
                  scenario === "wrong-id"
                    ? "different-completion"
                    : "completion",
                text,
                signature:
                  scenario === "invalid-signature"
                    ? "00".repeat(65)
                    : signature,
              };
              return new Response(wire);
            }
            expect(url.pathname).toBe("/api/v1/tee/signature");
            return Response.json(receipt);
          },
          {},
        ),
      );
      try {
        const model = await createPrivacyRuntime({
          providers: { venice: { allowUnboundReceipts } },
          onEvent: (event) => {
            events.push(event);
          },
        }).resolveModel(
          "venice/model",
          { tee: "required", e2ee: "required" },
          {
            onReport: (report) => {
              reports.push(report);
            },
          },
        );
        const invoke = async () => {
          if (scenario === "streamed-mismatch") {
            return await streamText({
              model,
              prompt: "private prompt",
              maxRetries: 0,
            }).text;
          }
          return (
            await generateText({
              model,
              prompt: "private prompt",
              maxRetries: 0,
            })
          ).text;
        };
        if (status === "rejected") {
          await expect(invoke()).rejects.toThrow();
        } else {
          expect(await invoke()).toBe("reply");
        }
        expect(reports[0]?.status).toBe(status);
        if (scenario === "invalid-tool-envelope") {
          expect(reports[0]?.errorCode).toBe("PRIVACY_INVALID_RESPONSE");
          expect(
            events.find(
              (event) =>
                event.diagnostic?.operation === "response-decoding" &&
                event.diagnostic.status === "failed",
            )?.diagnostic?.failureReason,
          ).toBe("invalid-tool-envelope");
          expect(fetchMock).toHaveBeenCalledTimes(2);
        }

        if (status === "degraded") {
          expect(reports[0]?.errorCode).toBe("PRIVACY_BINDING_UNAVAILABLE");
          expect(reports[0]?.checks).toMatchObject({
            encryption: "passed",
            responseBinding: "failed",
          });
          expect(reports[0]?.receiptChecks).toEqual({
            completionId: "passed",
            signature: "passed",
            model: "passed",
            requestBody: "failed",
            responseBody: "failed",
          });
          expect(events.at(-1)?.phase).toBe("degraded");
        }
        if (scenario === "hardware-failure") {
          expect(fetchMock).toHaveBeenCalledTimes(1);
        }
      } finally {
        hardware.mockRestore();
        fetchMock.mockRestore();
        enclave.privateKey.fill(0);
      }
    },
  );

  it("should encrypt combined system instructions and preserve successful decryption when the receipt rejects", async () => {
    const enclave = generateVeniceKeyPair();
    const reports: PrivacyReport[] = [];
    const hardware = vi.spyOn(
      verification,
      "verifyHardwareEvidence",
    ).mockResolvedValue(undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
          const url = new URL(String(input));
          if (url.pathname.endsWith("/tee/attestation")) {
            return Response.json({
              model: "model",
              verified: true,
              nonce: url.searchParams.get("nonce"),
              intel_quote: "00",
              signing_key: Buffer.from(enclave.publicKey).toString("hex"),
            });
          }
          if (url.pathname.endsWith("/chat/completions")) {
            const request = JSON.parse(String(init?.body)) as {
              messages: { role: string; content: string }[];
              tools?: unknown;
            };
            expect(request.tools).toBeUndefined();
            const systems = request.messages.filter(
              (message) => message.role === "system",
            );
            expect(systems).toHaveLength(1);
            const instructions = decryptVeniceChunk(
              systems[0]!.content,
              enclave.privateKey,
            );
            expect(instructions).toContain("Private agent instructions");
            expect(instructions).toContain("private_tool");
            for (const message of request.messages) {
              expect(message.content).toMatch(/^[a-f0-9]+$/);
            }
            expect(String(init?.body)).not.toContain("Private");
            const clientKey = Buffer.from(
              new Headers(init?.headers).get("x-venice-tee-client-pub-key")!,
              "hex",
            );
            return new Response(
              `data: ${JSON.stringify({ id: "completion", model: "model", choices: [{ index: 0, delta: { content: encryptVeniceMessage("Private reply", clientKey) }, finish_reason: "stop", matched_stop: 154827 }], cost: { usd: 0.001, diem: 0 } })}\n\ndata: [DONE]\n\n`,
            );
          }
          expect(url.pathname).toBe("/api/v1/tee/signature");
          return Response.json({});
        },
        {},
      ),
    );
    try {
      const model = await createPrivacyRuntime().resolveModel(
        "venice/model",
        { tee: "required", e2ee: "required" },
        {
          onReport: (report) => {
            reports.push(report);
          },
        },
      );
      await expect(
        generateText({
          model,
          system: "Private agent instructions",
          prompt: "Private prompt",
          tools: {
            private_tool: {
              inputSchema: jsonSchema({ type: "object", properties: {} }),
            },
          },
          maxRetries: 0,
        }),
      ).rejects.toMatchObject({
        code: "PRIVACY_RESPONSE_AUTHENTICATION_FAILED",
      });
      expect(reports[0]?.checks).toMatchObject({
        encryption: "passed",
        responseBinding: "failed",
      });
      expect(reports[0]?.status).toBe("rejected");
      expect(reports[0]?.receiptChecks).toEqual({
        completionId: "unavailable",
        signature: "unavailable",
        model: "unavailable",
        requestBody: "unavailable",
        responseBody: "unavailable",
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      hardware.mockRestore();
      fetchMock.mockRestore();
      enclave.privateKey.fill(0);
    }
  });

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
    ]) {
      expect(PrivacyRequirementsSchema.safeParse(value).success).toBe(false);
    }
  });

  it("should reject invalid trusted endpoints and resource limits", () => {
    for (const options of [
      { pccsURL: "http://untrusted.test" },
      { nrasURL: "https://key:secret@example.test" },
      { providers: { venice: { pccsURL: "http://untrusted.test" } } },
      {
        providers: {
          venice: { nrasURL: "https://key:secret@example.test" },
        },
      },
      {
        providers: {
          venice: { trustedWorkloads: { "venice/model": [] } },
        },
      },
      { limits: { maxWireBytes: 0 } },
      { limits: { requestTimeoutMs: Infinity } },
    ]) {
      expect(() => createPrivacyRuntime(options)).toThrow(
        "Invalid protection configuration",
      );
    }
  });

  it("should reject ambiguous legacy and provider-scoped verification options", () => {
    for (const providerOptions of [
      { pccsURL: "https://pccs.example.test" },
      { nrasURL: "https://nras.example.test" },
      { trustedWorkloads: {} },
    ]) {
      expect(() =>
        createPrivacyRuntime({
          ...providerOptions,
          providers: { venice: providerOptions },
        }),
      ).toThrow("Invalid protection configuration");
    }
  });

  it("should apply provider-scoped verification options and preserve disjoint legacy settings", async () => {
    const pccsURL = "https://pccs.example.test";
    const nrasURL = "https://nras.example.test/v4/attest/gpu";
    const trustedWorkloads = {
      "venice/model": [
        {
          mrTd: "11".repeat(48),
          rtMr0: "22".repeat(48),
          rtMr1: "33".repeat(48),
          rtMr2: "44".repeat(48),
          appId: "55".repeat(20),
          keyProviderHash: "66".repeat(32),
          composeHash: "77".repeat(32),
          osImageHash: "88".repeat(32),
        },
      ],
    };
    const contexts: Parameters<
      typeof verification.verifyHardwareEvidence
    >[1][] = [];
    const hardware = vi.spyOn(
      verification,
      "verifyHardwareEvidence",
    ).mockImplementation(async (_evidence, context) => {
      contexts.push(context);
      throw privacyError("PRIVACY_WORKLOAD_UNTRUSTED");
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (input: Parameters<typeof fetch>[0]) => {
          const url = new URL(String(input));
          expect(url.pathname).toBe("/api/v1/tee/attestation");
          return Response.json({
            model: "model",
            verified: true,
            nonce: url.searchParams.get("nonce"),
            intel_quote: "00",
            signing_key: `04${"00".repeat(64)}`,
          });
        },
        {},
      ),
    );
    try {
      for (const options of [
        { providers: { venice: { pccsURL, nrasURL, trustedWorkloads } } },
        { nrasURL, providers: { venice: { pccsURL, trustedWorkloads } } },
        { pccsURL, nrasURL, trustedWorkloads },
      ]) {
        const model = await createPrivacyRuntime(options).resolveModel(
          "venice/model",
          { tee: "required", e2ee: "required" },
        );
        await expect(
          generateText({ model, prompt: "never sent", maxRetries: 0 }),
        ).rejects.toMatchObject({ code: "PRIVACY_WORKLOAD_UNTRUSTED" });
      }
      expect(contexts).toHaveLength(3);
      for (const context of contexts) {
        expect(context).toMatchObject({
          pccsURL,
          nrasURL,
          trustedWorkloads: trustedWorkloads["venice/model"],
        });
      }
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      hardware.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("should reject providers without a code-owned protected transport", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(
      createPrivacyRuntime().resolveModel("custom/model", { tee: "required" }),
    ).rejects.toMatchObject({ code: "PRIVACY_UNSUPPORTED_PROVIDER" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should reject a registered Venice override before resolving credentials or sending requests", async () => {
    const resolveCredential = vi.spyOn(getGlobalCredentialStore(), "resolve");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    registerProviderDefinition({
      id: "venice",
      name: "Custom Venice",
      packageName: "custom-provider",
    });
    try {
      await expect(
        createPrivacyRuntime().resolveModel("venice/model", {
          tee: "required",
        }),
      ).rejects.toMatchObject({ code: "PRIVACY_UNSUPPORTED_PROVIDER" });
      expect(resolveCredential).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      unregisterProviderDefinition("venice");
      resolveCredential.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("should honor pre-aborted resolution before resolving credentials or sending requests", async () => {
    const resolveCredential = vi.spyOn(getGlobalCredentialStore(), "resolve");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      await expect(
        createPrivacyRuntime().resolveModel(
          "venice/model",
          { tee: "required" },
          { signal: AbortSignal.abort("private cancellation reason") },
        ),
      ).rejects.toMatchObject({ code: "PRIVACY_CANCELLED" });
      expect(resolveCredential).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      resolveCredential.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("should accept encrypted local tools and proceed to attestation without transmitting prompt content", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (
          input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          const url = new URL(String(input));
          expect(url.pathname).toBe("/api/v1/tee/attestation");
          expect(new Headers(init?.headers).get("Authorization")).toBe(
            "Bearer private-test-key",
          );
          expect(init?.redirect).toBe("error");
          expect(String(input)).not.toContain("private-prompt");
          return Response.json({});
        },
        {},
      ),
    );
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
    ).rejects.toMatchObject({ code: "PRIVACY_ATTESTATION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should reject unverified evidence without inference, retries, or leaked payloads", async () => {
    const events: PrivacyEvent[] = [];
    const reports: PrivacyReport[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
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
        {},
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
    expect(
      events.filter((event) => !event.diagnostic).map((event) => event.phase),
    ).toEqual(["preflight", "attestation", "rejected"]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.status).toBe("rejected");
    const serialized = JSON.stringify({ failure, events, reports });
    for (const secret of [
      "private-prompt",
      "private-test-key",
      "do-not-leak",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("should preserve successful hardware checks when software approval rejects before inference", async () => {
    const reports: PrivacyReport[] = [];
    const events: PrivacyEvent[] = [];
    const mismatch: NonNullable<PrivacyReport["workloadMismatch"]> = {
      reason: "measurement-mismatch",
      profiles: [
        {
          profileIndex: 0,
          differences: [
            {
              field: "composeHash",
              expected: "11".repeat(32),
              actual: "22".repeat(32),
            },
          ],
        },
      ],
    };
    const hardware = vi.spyOn(
      verification,
      "verifyHardwareEvidence",
    ).mockImplementation(async (_evidence, context) => {
      context.onDiagnostic?.({
        operation: "cpu-verification",
        status: "succeeded",
      });
      context.onDiagnostic?.({
        operation: "gpu-verification",
        status: "succeeded",
      });
      context.onWorkloadMismatch?.(mismatch);
      context.onDiagnostic?.({
        operation: "workload-verification",
        status: "failed",
        errorCode: "PRIVACY_WORKLOAD_UNTRUSTED",
        failure: "verification",
      });
      throw privacyError("PRIVACY_WORKLOAD_UNTRUSTED");
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (input: Parameters<typeof fetch>[0]) => {
          const url = new URL(String(input));
          expect(url.pathname).toBe("/api/v1/tee/attestation");
          return Response.json({
            model: "model",
            verified: true,
            nonce: url.searchParams.get("nonce"),
            intel_quote: "00",
            signing_key: `04${"00".repeat(64)}`,
          });
        },
        {},
      ),
    );
    try {
      const model = await createPrivacyRuntime({
        onEvent: (event) => {
          events.push(event);
        },
      }).resolveModel(
        "venice/model",
        { tee: "required", e2ee: "required" },
        {
          onReport: (report) => {
            reports.push(report);
          },
        },
      );
      await expect(
        generateText({
          model,
          prompt: "never sent to inference",
          maxRetries: 0,
        }),
      ).rejects.toMatchObject({ code: "PRIVACY_WORKLOAD_UNTRUSTED" });
      expect(reports[0]?.checks).toMatchObject({
        cpu: "passed",
        gpu: "passed",
        freshness: "passed",
        keyBinding: "passed",
        workload: "failed",
        encryption: "unavailable",
        responseBinding: "unavailable",
      });
      expect(reports[0]?.workloadMismatch).toEqual(mismatch);
      expect(
        events.find(
          (event) =>
            event.diagnostic?.operation === "workload-verification" &&
            event.diagnostic.status === "failed",
        )?.diagnostic?.workloadMismatch,
      ).toEqual(mismatch);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      hardware.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("should reject observer failures before transmitting content", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
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
    const fetchMock = vi.spyOn(globalThis, "fetch");
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
