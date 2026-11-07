import type { MockInstance } from "vitest";
import { tinfoilDownstream } from "./downstream/downstream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText, jsonSchema, stepCountIs, streamText, tool } from "ai";
import {
  Identity,
  PROTOCOL,
  deriveResponseKeys,
  encryptChunk,
  bytesToHex,
  EXPORT_LABEL,
  EXPORT_LENGTH,
  type RequestContext,
} from "ehbp";
import { tinfoilVerifier } from "./verification/owned/owned";
import type { TinfoilVerification } from "./verification/owned/owned.types";
import { createTinfoilProtectedModel } from "./tinfoil";
import { DEFAULT_PRIVACY_LIMITS } from "../../privacy/privacy.constants";
import type { PrivacyEvent, PrivacyReport } from "../../privacy/privacy.types";
import { getModelPrivacyRequirements } from "../../model.utils";
import { getGlobalProviderResolver } from "../provider-resolver";
import { resolveModelWithPrivacy } from "../../model";
import {
  createCredentialStore,
  getGlobalCredentialStore,
  setGlobalCredentialStore,
} from "../../../credentials";
import { createJsonFileCredentialBackend } from "../../../credentials/backends/json-file";
import { createPrivacyRuntime } from "../../privacy/privacy";
import {
  registerProviderDefinition,
  unregisterProviderDefinition,
} from "../providers";

const originalFetch = globalThis.fetch;
const originalEncrypt = Identity.prototype.encryptRequestWithContext;
let serverIdentity: Identity;
let context: RequestContext | null;
let plaintextRequests: Record<string, unknown>[];
let wireRequests: string[];
let events: PrivacyEvent[];
let reports: PrivacyReport[];
let verification: MockInstance<typeof tinfoilVerifier.verify>;
let downstream: MockInstance<typeof tinfoilDownstream.audit>;
let poolChecks: number;
let reply: string;
let responseMode: "valid" | "plaintext" | "tampered" | "truncated";
let inferenceCalls: number;
let verificationResult: {
  readonly [
    Property in keyof TinfoilVerification
  ]: TinfoilVerification[Property];
};
let rotation: "none" | "valid" | "missing-key";
const previousCacheSecret = process.env.TINFOIL_USER_CACHE_SECRET;

/** Encrypt a simulated enclave response using the actual per-request HPKE context.
 * @returns {Promise<Response>} Authenticated response fixture.
 */
async function encryptedResponse() {
  if (!context) {
    throw new Error("Missing request encryption context");
  }
  const responseNonce = crypto.getRandomValues(new Uint8Array(32));
  const secret = await context.senderContext.Export(
    new TextEncoder().encode(EXPORT_LABEL),
    EXPORT_LENGTH,
  );
  const keys = await deriveResponseKeys(
    secret,
    context.requestEnc,
    responseNonce,
  );
  const ciphertext = await encryptChunk(
    keys,
    0,
    new TextEncoder().encode(reply),
  );
  if (responseMode === "tampered") {
    ciphertext[ciphertext.length - 1]! ^= 1;
  }
  const frame = new Uint8Array(4 + ciphertext.length);
  new DataView(frame.buffer).setUint32(0, ciphertext.length, false);
  frame.set(ciphertext, 4);
  return new Response(
    responseMode === "truncated" ? frame.slice(0, -1) : frame,
    {
      headers: {
        "content-type": reply.startsWith("data:")
          ? "text/event-stream"
          : "application/json",
        [PROTOCOL.RESPONSE_NONCE_HEADER]: bytesToHex(responseNonce),
      },
    },
  );
}

/** Create a completion fixture with optional native tool invocation.
 * @param {boolean} withTool - Include an offered function call.
 * @returns {string} Serialized completion.
 */
function completion(withTool = false) {
  return JSON.stringify({
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1,
    model: "test",
    choices: [
      {
        index: 0,
        finish_reason: withTool ? "tool_calls" : "stop",
        message: {
          role: "assistant",
          content: withTool ? null : "Authenticated reply",
          ...(withTool
            ? {
                tool_calls: [
                  {
                    id: "call-test",
                    type: "function",
                    function: {
                      name: "lookup",
                      arguments: '{"query":"private query"}',
                    },
                  },
                ],
              }
            : {}),
        },
      },
    ],
    usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
  });
}

/** Create the production adapter with test-owned credential and observers.
 * @param {PrivacyLimits} limits - Request resource limits.
 * @returns {LanguageModel} Protected test model.
 */
function createModel(limits = DEFAULT_PRIVACY_LIMITS) {
  const model = createTinfoilProtectedModel({
    modelId: "test",
    apiKey: "secret-api-key",
    requirements: { tee: "required", e2ee: "required" },
    limits,
    onEvent: (event) => {
      events.push(event);
    },
    onReport: (report) => {
      reports.push(report);
    },
  });
  if (typeof model === "string" || model.specificationVersion !== "v3") {
    throw new Error("Expected a version 3 protected model");
  }
  return model;
}

beforeEach(async () => {
  process.env.TINFOIL_USER_CACHE_SECRET = "test-cache-secret";
  poolChecks = 0;
  downstream = vi.spyOn(tinfoilDownstream, "audit").mockImplementation(
    async () => ({
      expiresAt: Date.now() + 60000,
      poolDigest: "aa".repeat(32),
      report: {
        scope: "router-admitted-pool",
        identitySource: "client-verified-cpu",
        modelRepository: "tinfoilsh/model",
        enclaveCount: 1,
        gpuCount: 4,
      },
      assertCurrentPool: async () => {
        poolChecks++;
      },
    }),
  );
  serverIdentity = await Identity.generate();
  context = null;
  plaintextRequests = [];
  wireRequests = [];
  events = [];
  reports = [];
  inferenceCalls = 0;
  rotation = "none";
  reply = completion();
  responseMode = "valid";
  const publicKey = await serverIdentity.getPublicKeyHex();
  verificationResult = {
    configRepo: "tinfoilsh/confidential-model-router",
    codeDigest: "ab".repeat(32),
    codeTag: "v1",
    gpuCount: 0,
    enclaveMeasurement: { type: "sev-snp", launch: "cd".repeat(48) },
    freshnessExpiresAt: new Date(Date.now() + 60000),
    config: undefined,
    runtime: undefined,
    platform: undefined,
    hpkePublicKey: () => publicKey,
  };
  verification = vi.spyOn(tinfoilVerifier, "verify").mockImplementation(
    async () => verificationResult,
  );
  vi.spyOn(Identity.prototype, "encryptRequestWithContext").mockImplementation(
    async function (this: Identity, request) {
      plaintextRequests.push(
        JSON.parse(await request.clone().text()) as Record<string, unknown>,
      );
      const result = await originalEncrypt.call(this, request);
      context = result.context;
      return result;
    },
  );
  globalThis.fetch = Object.assign(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const request =
        input instanceof Request ? input : new Request(String(input), init);
      if (
        new URL(request.url).pathname === "/.well-known/tinfoil-attestation"
      ) {
        expect(new URL(request.url).searchParams.get("nonce")).toMatch(
          /^[a-f0-9]{64}$/,
        );
        expect(request.headers.has("authorization")).toBe(false);
        return Response.json({
          format: "https://tinfoil.sh/predicate/attestation/v3",
        });
      }
      expect(request.url).toBe(
        "https://inference.tinfoil.sh/v1/chat/completions",
      );
      expect(request.redirect).toBe("error");
      expect(request.headers.get("authorization")).toBe(
        "Bearer secret-api-key",
      );
      expect(request.headers.has(PROTOCOL.ENCAPSULATED_KEY_HEADER)).toBe(true);
      wireRequests.push(await request.text());
      inferenceCalls++;
      if (rotation !== "none" && inferenceCalls === 1) {
        const nextIdentity = await Identity.generate();
        const nextKey =
          rotation === "missing-key"
            ? undefined
            : await nextIdentity.getPublicKeyHex();
        verificationResult = {
          ...verificationResult,
          hpkePublicKey: () => nextKey,
        };
        return Response.json(
          { type: PROTOCOL.KEY_CONFIG_PROBLEM_TYPE, title: "rotated" },
          {
            status: 422,
            headers: { "content-type": PROTOCOL.PROBLEM_JSON_MEDIA_TYPE },
          },
        );
      }
      if (responseMode === "plaintext") {
        return Response.json(JSON.parse(completion()) as unknown);
      }
      return encryptedResponse();
    },
    {},
  );
});
afterEach(() => {
  if (previousCacheSecret === undefined) {
    delete process.env.TINFOIL_USER_CACHE_SECRET;
  } else {
    process.env.TINFOIL_USER_CACHE_SECRET = previousCacheSecret;
  }
  globalThis.fetch = originalFetch;
  verification.mockRestore();
  downstream.mockRestore();
  // Restore only spies owned by these tests, leaving unrelated module mocks intact.
  Identity.prototype.encryptRequestWithContext = originalEncrypt;
});

describe("Tinfoil protected inference", () => {
  it("should reject GPU appraisal failure before sending any prompt", async () => {
    downstream.mockRejectedValue(
      Object.assign(new Error("GPU verification failed"), {
        code: "PRIVACY_ATTESTATION_FAILED",
      }),
    );
    await expect(
      generateText({
        model: createModel(),
        prompt: "private prompt",
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_ATTESTATION_FAILED" });
    expect(inferenceCalls).toBe(0);
    expect(reports[0]?.checks.gpu).toBe("failed");
  });
  it("should report the rejected model CPU without marking unexamined GPU evidence failed", async () => {
    downstream.mockImplementation(async (options) => {
      options.onDiagnostic?.({
        operation: "cpu-verification",
        status: "failed",
        failureReason: "downstream-cpu-quote-rejected",
        errorCode: "PRIVACY_ATTESTATION_FAILED",
      });
      throw Object.assign(new Error("CPU quote rejected"), {
        code: "PRIVACY_ATTESTATION_FAILED",
      });
    });
    await expect(
      generateText({
        model: createModel(),
        prompt: "private prompt",
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_ATTESTATION_FAILED" });
    expect(inferenceCalls).toBe(0);
    expect(reports[0]).toMatchObject({
      checks: { cpu: "passed", gpu: "unavailable" },
      verificationSteps: {
        downstreamCpu: "failed",
        gpuEvidence: "unavailable",
      },
    });
  });
  it("should discard authenticated completions if the admitted pool changes", async () => {
    downstream.mockResolvedValue({
      expiresAt: Date.now() + 60000,
      poolDigest: "aa".repeat(32),
      report: {
        scope: "router-admitted-pool",
        identitySource: "client-verified-cpu",
        modelRepository: "tinfoilsh/model",
        enclaveCount: 1,
        gpuCount: 4,
      },
      assertCurrentPool: async () => {
        throw Object.assign(new Error("Pool changed"), {
          code: "PRIVACY_BINDING_UNAVAILABLE",
        });
      },
    });
    await expect(
      generateText({
        model: createModel(),
        prompt: "private prompt",
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_BINDING_UNAVAILABLE" });
    expect(inferenceCalls).toBe(1);
    expect(reports[0]?.checks).toMatchObject({
      gpu: "failed",
      responseBinding: "passed",
      encryption: "passed",
    });
    expect(reports[0]?.verificationSteps?.admittedPoolBinding).toBe("failed");
  });
  it("should not execute a tool from a completion whose admitted pool changed", async () => {
    reply = completion(true);
    let executions = 0;
    downstream.mockResolvedValue({
      expiresAt: Date.now() + 60000,
      poolDigest: "aa".repeat(32),
      report: {
        scope: "router-admitted-pool",
        identitySource: "client-verified-cpu",
        modelRepository: "tinfoilsh/model",
        enclaveCount: 1,
        gpuCount: 4,
      },
      assertCurrentPool: async () => {
        throw Object.assign(new Error("Pool changed"), {
          code: "PRIVACY_BINDING_UNAVAILABLE",
        });
      },
    });
    await expect(
      generateText({
        model: createModel(),
        prompt: "private prompt",
        maxRetries: 0,
        tools: {
          lookup: tool({
            description: "Look up a value",
            inputSchema: jsonSchema<{ query: string }>({
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
            }),
            execute: async () => {
              executions++;
              return "result";
            },
          }),
        },
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_BINDING_UNAVAILABLE" });
    expect(executions).toBe(0);
  });
  it("should report independently checked GPUs and the independently verified model CPU identity", async () => {
    await generateText({
      model: createModel(),
      prompt: "private prompt",
      maxRetries: 0,
    });
    expect(poolChecks).toBe(1);
    expect(reports[0]).toMatchObject({
      checks: { gpu: "passed" },
      gpuAssociation: "verified-model-enclave",
      downstreamVerification: {
        identitySource: "client-verified-cpu",
        gpuCount: 4,
        enclaveCount: 1,
      },
      verificationSteps: {
        downstreamCpu: "passed",
        admittedPoolBinding: "passed",
      },
    });
  });
  it("should reject expired verified evidence before any inference", async () => {
    verificationResult = {
      ...verificationResult,
      freshnessExpiresAt: new Date(Date.now() - 1),
    };
    await expect(
      generateText({
        model: createModel(),
        prompt: "private prompt",
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_ATTESTATION_FAILED" });
    expect(inferenceCalls).toBe(0);
  });
  it("should discard authenticated output if its V3 authorization expires during inference", async () => {
    const now = Date.now();
    verificationResult = {
      ...verificationResult,
      freshnessExpiresAt: new Date(now + 60000),
    };
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const currentFetch: (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => Promise<Response> = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const response = await currentFetch(input, init);
        if (String(input).includes("/chat/completions")) {
          clock.mockReturnValue(now + 61000);
        }
        return response;
      },
      {},
    );
    try {
      await expect(
        generateText({
          model: createModel(),
          prompt: "private prompt",
          maxRetries: 0,
        }),
      ).rejects.toMatchObject({ code: "PRIVACY_ATTESTATION_FAILED" });
      expect(inferenceCalls).toBe(1);
      expect(reports[0]?.status).toBe("rejected");
    } finally {
      clock.mockRestore();
    }
  });

  it("should verify nonce-bound V3 evidence and report authenticated checks", async () => {
    await generateText({
      model: createModel(),
      prompt: "private prompt",
      maxRetries: 0,
    });
    expect(verification).toHaveBeenCalledTimes(1);
    expect(reports[0]?.verificationSteps).toMatchObject({
      v3: "passed",
      nonceBinding: "passed",
      provenance: "passed",
      quote: "passed",
      keyBinding: "passed",
      freshness: "passed",
    });
    expect(reports[0]?.freshnessExpiresAt).toBeDefined();
    expect(
      events.some(
        (event) => event.diagnostic?.verificationSteps?.v3 === "passed",
      ),
    ).toBe(true);
  });
  it("should recover a key mismatch only after fresh V3 verification", async () => {
    rotation = "valid";
    const result = await generateText({
      model: createModel(),
      prompt: "private prompt",
      maxRetries: 0,
    });
    expect(result.text).toBe("Authenticated reply");
    expect(inferenceCalls).toBe(2);
    expect(verification).toHaveBeenCalledTimes(2);
    expect(reports[0]?.status).toBe("verified");
  });
  it("should reject an HPKE downgrade during V3 key-rotation recovery", async () => {
    rotation = "missing-key";
    await expect(
      generateText({
        model: createModel(),
        prompt: "private prompt",
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_ATTESTATION_FAILED" });
    expect(inferenceCalls).toBe(1);
    expect(verification).toHaveBeenCalledTimes(2);
    expect(reports[0]?.status).toBe("rejected");
  });
  it("should report V3 provenance failures without logging raw errors", async () => {
    verification.mockRejectedValue(
      Object.assign(new Error("sensitive verification error detail"), {
        name: "TinfoilVerificationError",
        layer: "provenance",
      }),
    );
    await expect(
      generateText({
        model: createModel(),
        prompt: "private prompt",
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_ATTESTATION_FAILED" });
    expect(inferenceCalls).toBe(0);
    expect(reports[0]?.verificationSteps?.v3).toBe("failed");
    expect(
      events.some((event) => event.diagnostic?.failureReason === "provenance"),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toContain("sensitive SDK error detail");
  });

  it("should automatically resolve a Tinfoil model and environment credential through the shared privacy runtime", async () => {
    const previousStore = getGlobalCredentialStore();
    setGlobalCredentialStore(
      createCredentialStore({
        backend: createJsonFileCredentialBackend({
          filePath: "/tmp/comma-tinfoil-unused-credentials.json",
        }),
        env: { TINFOIL_API_KEY: "secret-api-key" },
      }),
    );
    try {
      const resolved = await resolveModelWithPrivacy("tinfoil/test");
      expect(resolved.privacy).toEqual({ tee: "required", e2ee: "required" });
      const result = await generateText({
        model: resolved.model,
        prompt: "private prompt",
        maxRetries: 0,
      });
      expect(result.text).toBe("Authenticated reply");
      expect(inferenceCalls).toBe(1);
    } finally {
      setGlobalCredentialStore(previousStore);
    }
  });
  it("should reject a response replayed from a different encrypted request", async () => {
    const currentFetch: (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => Promise<Response> = globalThis.fetch;
    let replayBytes: ArrayBuffer | undefined;
    let replayHeaders: Record<string, string> = {};
    globalThis.fetch = Object.assign(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        if (String(input).includes("/.well-known/tinfoil-attestation")) {
          return currentFetch(input, init);
        }
        if (replayBytes) {
          return new Response(replayBytes, { headers: replayHeaders });
        }
        const response = await currentFetch(input, init);
        replayBytes = await response.arrayBuffer();
        replayHeaders = Object.fromEntries(response.headers);
        return new Response(replayBytes, { headers: replayHeaders });
      },
      {},
    );
    await generateText({
      model: createModel(),
      prompt: "first private prompt",
      maxRetries: 0,
    });
    await expect(
      generateText({
        model: createModel(),
        prompt: "second private prompt",
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_RESPONSE_AUTHENTICATION_FAILED" });
    expect(reports.map((report) => report.status)).toEqual([
      "verified",
      "rejected",
    ]);
  });

  it("should resolve the built-in provider to the protected adapter", async () => {
    const factory = await getGlobalProviderResolver()("tinfoil", {
      type: "api",
      key: "test-key",
    });
    const model = factory("test");
    expect(typeof model === "object" && model.provider).toBe(
      "tinfoil.protected",
    );
    await expect(
      getGlobalProviderResolver()("tinfoil", { type: "custom", data: {} }),
    ).rejects.toMatchObject({ code: "PRIVACY_CREDENTIAL_REQUIRED" });
  });
  it("should reject request options that override the selected model", async () => {
    await expect(
      generateText({
        model: createModel(),
        prompt: "private prompt",
        providerOptions: { tinfoil: { model: "different-model" } },
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_CONFIGURATION_ERROR" });
    expect(inferenceCalls).toBe(0);
  });
  it("should reject streams without a completion finish reason", async () => {
    reply =
      'data: {"id":"test","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":"Incomplete reply"},"finish_reason":null}]}\n\n';
    await expect(
      createModel().doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_INVALID_RESPONSE" });
    expect(reports[0]?.status).toBe("rejected");
  });
  it("should reject cancelled requests before any network traffic", async () => {
    const controller = new AbortController();
    controller.abort("private reason");
    await expect(
      generateText({
        model: createModel(),
        prompt: "private prompt",
        abortSignal: controller.signal,
        maxRetries: 0,
      }),
    ).rejects.toBeDefined();
    expect(inferenceCalls).toBe(0);
  });

  it("should automatically require TEE and E2EE for an uncatalogued model", () => {
    expect(getModelPrivacyRequirements("tinfoil/new-model")).toEqual({
      tee: "required",
      e2ee: "required",
    });
  });
  it("should encrypt the complete conversation and authenticate its response", async () => {
    const result = await generateText({
      model: createModel(),
      system: "private system",
      prompt: "private prompt",
      maxRetries: 0,
    });
    expect(result.text).toBe("Authenticated reply");
    expect(plaintextRequests[0]?.messages).toEqual([
      { role: "system", content: "private system" },
      { role: "user", content: "private prompt" },
    ]);
    expect(wireRequests[0]).not.toContain("private");
    expect(reports[0]).toMatchObject({
      status: "verified",
      checks: {
        cpu: "passed",
        gpu: "passed",
        freshness: "passed",
        keyBinding: "passed",
        responseBinding: "passed",
        encryption: "passed",
        workload: "passed",
      },
    });
    expect(JSON.stringify(events)).not.toContain("secret-api-key");
    expect(JSON.stringify(events)).not.toContain("private prompt");
  });
  it("should support native local tools and encrypt tool results on the next step", async () => {
    reply = completion(true);
    let executions = 0;
    const result = await generateText({
      model: createModel(),
      prompt: "private prompt",
      maxRetries: 0,
      stopWhen: stepCountIs(2),
      tools: {
        lookup: tool({
          inputSchema: jsonSchema<{ query: string }>({
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
            additionalProperties: false,
          }),
          execute: async ({ query }) => {
            executions++;
            expect(query).toBe("private query");
            expect(reports[0]?.status).toBe("verified");
            reply = completion();
            return "private tool result";
          },
        }),
      },
    });
    expect(executions).toBe(1);
    expect(result.text).toBe("Authenticated reply");
    expect(JSON.stringify(plaintextRequests[0]?.tools)).toContain("lookup");
    expect(JSON.stringify(plaintextRequests[1]?.messages)).toContain(
      "private tool result",
    );
    for (const wire of wireRequests) {
      expect(wire).not.toContain("private");
      expect(wire).not.toContain("lookup");
    }
    expect(reports).toHaveLength(2);
  });
  it.each(["plaintext", "tampered", "truncated"] as const)(
    "should reject %s responses without releasing tool calls",
    async (mode) => {
      responseMode = mode;
      reply = completion(true);
      let executions = 0;
      await expect(
        generateText({
          model: createModel(),
          prompt: "private prompt",
          maxRetries: 0,
          tools: {
            lookup: tool({
              inputSchema: jsonSchema({ type: "object" }),
              execute: async () => {
                executions++;
                return "bad";
              },
            }),
          },
        }),
      ).rejects.toMatchObject({
        code: "PRIVACY_RESPONSE_AUTHENTICATION_FAILED",
      });
      expect(executions).toBe(0);
      expect(reports[0]?.status).toBe("rejected");
    },
  );
  it("should never send inference when attestation fails", async () => {
    verification.mockRejectedValue(new Error("sensitive SDK error"));
    await expect(
      generateText({
        model: createModel(),
        prompt: "private prompt",
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_ATTESTATION_FAILED" });
    expect(inferenceCalls).toBe(0);
    expect(JSON.stringify(events)).not.toContain("sensitive SDK error");
  });
  it("should never fall back to TLS when the attestation has no HPKE key", async () => {
    verification.mockResolvedValue({
      ...verificationResult,
      hpkePublicKey: () => undefined,
    });
    await expect(
      generateText({
        model: createModel(),
        prompt: "private prompt",
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_ATTESTATION_FAILED" });
    expect(inferenceCalls).toBe(0);
  });
  it("should enforce verification deadlines before sending inference", async () => {
    verification.mockImplementation(() => new Promise(() => {}));
    await expect(
      generateText({
        model: createModel({
          ...DEFAULT_PRIVACY_LIMITS,
          verificationTimeoutMs: 20,
        }),
        prompt: "private prompt",
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_TIMEOUT" });
    expect(inferenceCalls).toBe(0);
  });
  it("should enforce encrypted response limits", async () => {
    await expect(
      generateText({
        model: createModel({ ...DEFAULT_PRIVACY_LIMITS, maxWireBytes: 16 }),
        prompt: "private prompt",
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_LIMIT_EXCEEDED" });
  });
  it("should reject registered provider overrides for protected inference", async () => {
    registerProviderDefinition({
      id: "tinfoil",
      name: "Untrusted",
      packageName: "untrusted",
    });
    try {
      await expect(
        createPrivacyRuntime().resolveModel("tinfoil/test", {
          tee: "required",
          e2ee: "required",
        }),
      ).rejects.toMatchObject({ code: "PRIVACY_UNSUPPORTED_PROVIDER" });
    } finally {
      unregisterProviderDefinition("tinfoil");
    }
    expect(inferenceCalls).toBe(0);
  });
  it("should authenticate streaming completions before exposing output", async () => {
    reply =
      'data: {"id":"test","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"role":"assistant","content":"Secure stream"},"finish_reason":null}]}\n\ndata: {"id":"test","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    const result = streamText({
      model: createModel(),
      prompt: "private prompt",
      maxRetries: 0,
    });
    expect(await result.text).toBe("Secure stream");
    expect(reports[0]?.status).toBe("verified");
  });
});
