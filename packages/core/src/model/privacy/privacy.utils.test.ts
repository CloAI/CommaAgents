import { describe, expect, it } from "vitest";
import { fetchPrivacyBytes, tracePrivacyCheck } from "./privacy.utils";
import type { PrivacyDiagnostic } from "./privacy.types";
import { fetchVerificationResponse } from "../providers/venice/verification/verification.utils";
import { verifyHardwareEvidence } from "../providers/venice/verification/verification";

describe("privacy operation diagnostics", () => {
  it("should log response completion with a sanitized endpoint and authentication presence", async () => {
    const diagnostics: PrivacyDiagnostic[] = [];
    const service = Object.assign(
      async () => new Response("private-response"),
      {},
    );
    const result = await fetchPrivacyBytes(
      `https://user:password@service.test/attestation?model=test-model&nonce=${"ab".repeat(32)}&request_id=completion-1&token=private-token&model=second-model`,
      {
        headers: {
          Authorization: "Bearer private-key",
          Cookie: "session=private-cookie",
          "X-Api-Key": "private-api-key",
          "X-Custom-Secret": "private-custom-secret",
          "Content-Type": "application/json",
          "X-Protected-Client-Pub-Key": "04abcd",
          "X-Protected-Model-Pub-Key": "04ef01",
          "X-Protected-Signing-Algo": "ecdsa",
        },
      },
      {
        fetch: service,
        signal: new AbortController().signal,
        maxBytes: 100,
        operation: "attestation",
        visibleHeaders: new Set([
          "x-protected-client-pub-key",
          "x-protected-model-pub-key",
          "x-protected-signing-algo",
        ]),
        visibleQueryParams: new Set(["model", "nonce", "request_id"]),
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      },
    );
    expect(new TextDecoder().decode(result.bytes)).toBe("private-response");
    expect(diagnostics.map((diagnostic) => diagnostic.status)).toEqual([
      "started",
      "succeeded",
    ]);
    expect(diagnostics[1]).toMatchObject({
      endpoint: "https://service.test/attestation",
      authenticated: true,
      httpStatus: 200,
      requestHeaders: {
        authorization: "Bearer [REDACTED]",
        cookie: "[REDACTED]",
        "x-api-key": "[REDACTED]",
        "x-custom-secret": "[REDACTED]",
        "content-type": "application/json",
        "x-protected-client-pub-key": "04abcd",
        "x-protected-model-pub-key": "04ef01",
        "x-protected-signing-algo": "ecdsa",
      },
      queryParams: {
        model: ["test-model", "second-model"],
        nonce: ["ab".repeat(32)],
        request_id: ["completion-1"],
        token: ["[REDACTED]"],
      },
    });
    for (const secret of [
      "password",
      "private-key",
      "private-response",
      "private-token",
      "private-cookie",
      "private-api-key",
      "private-custom-secret",
    ]) {
      expect(JSON.stringify(diagnostics)).not.toContain(secret);
    }
  });

  it("should redact protocol metadata unless the adapter explicitly marks it public", async () => {
    const diagnostics: PrivacyDiagnostic[] = [];
    await fetchPrivacyBytes(
      "https://service.test/attestation?model=private-model&nonce=private-nonce&fmspc=private-chip",
      {
        headers: {
          Accept: "application/json",
          "X-Protected-Client-Pub-Key": "private-identity",
        },
      },
      {
        fetch: Object.assign(async () => new Response("ok"), {

        }),
        signal: new AbortController().signal,
        maxBytes: 100,
        operation: "attestation",
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      },
    );
    expect(diagnostics[1]).toMatchObject({
      requestHeaders: {
        accept: "application/json",
        "x-protected-client-pub-key": "[REDACTED]",
      },
      queryParams: {
        model: ["[REDACTED]"],
        nonce: ["[REDACTED]"],
        fmspc: ["[REDACTED]"],
      },
    });
    expect(JSON.stringify(diagnostics)).not.toContain("private-");
  });

  it("should retain structured HTTP validation errors without leaking echoed credentials or payloads", async () => {
    const diagnostics: PrivacyDiagnostic[] = [];
    const response = Response.json(
      {
        error: {
          code: "invalid_request_error",
          type: "validation_error",
          param: "venice_parameters.enable_e2ee",
          message: "Unrecognized request argument supplied: 'enable_e2ee'",
          details: [
            {
              code: "unrecognized_keys",
              path: ["venice_parameters", "enable_e2ee"],
              input: "private-prompt",
              message: "private echoed input",
            },
          ],
        },
      },
      { status: 400 },
    );
    await expect(
      fetchPrivacyBytes(
        "https://service.test/chat/completions",
        { headers: { Authorization: "Bearer private-key" } },
        {
          fetch: Object.assign(async () => response, {

          }),
          signal: new AbortController().signal,
          maxBytes: 8192,
          operation: "inference",
          onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
        },
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_PROVIDER_ERROR" });
    expect(diagnostics[1]).toMatchObject({
      httpStatus: 400,
      failure: "http",
      providerError: {
        code: "invalid_request_error",
        type: "validation_error",
        param: "venice_parameters.enable_e2ee",
        message: "Invalid or unsupported request parameter: enable_e2ee.",
        messageRedacted: true,
        validation: [
          { code: "unrecognized_keys", param: "venice_parameters.enable_e2ee" },
        ],
      },
    });
    expect(JSON.stringify(diagnostics)).not.toContain("private");
  });

  it("should normalize decryption errors and omit arbitrary provider messages", async () => {
    for (const message of [
      "Encrypted field is not valid hex: private ciphertext",
      "Provider failed for model 'z-ai/glm-5.3-flash': Encrypted field is not valid hex",
      "E2EE decryption failed: private-prompt",
      "Your prompt contained private-key and private-prompt",
    ]) {
      const diagnostics: PrivacyDiagnostic[] = [];
      await expect(
        fetchPrivacyBytes(
          "https://service.test/chat/completions",
          { headers: { Authorization: "Bearer private-key" } },
          {
            fetch: Object.assign(
              async () => Response.json({ error: message }, { status: 400 }),
              {},
            ),
            signal: new AbortController().signal,
            maxBytes: 8192,
            operation: "inference",
            onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
          },
        ),
      ).rejects.toMatchObject({ code: "PRIVACY_PROVIDER_ERROR" });
      expect(diagnostics[1]?.providerError?.messageRedacted).toBe(true);
      expect(JSON.stringify(diagnostics)).not.toContain("private");
      if (message.includes("Encrypted field")) {
        expect(diagnostics[1]?.providerError?.message).toBe(
          "Encrypted field is not valid hex.",
        );
      }
      if (message.startsWith("E2EE")) {
        expect(diagnostics[1]?.providerError?.message).toBe(
          "Provider could not decrypt the encrypted request.",
        );
      }
    }
  });

  it("should preserve HTTP status when error bodies are non-JSON, oversized, or stalled", async () => {
    const stalled = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("partial"));
        },
      }),
      { status: 400 },
    );
    for (const response of [
      new Response("private HTML body", { status: 502 }),
      new Response("private".repeat(4096), { status: 400 }),
      stalled,
    ]) {
      const diagnostics: PrivacyDiagnostic[] = [];
      await expect(
        fetchPrivacyBytes(
          "https://service.test/chat/completions",
          {},
          {
            fetch: Object.assign(async () => response, {

            }),
            signal:
              response === stalled
                ? AbortSignal.timeout(5)
                : new AbortController().signal,
            maxBytes: 65536,
            operation: "inference",
            onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
          },
        ),
      ).rejects.toThrow();
      expect(diagnostics[1]?.httpStatus).toBe(response.status);
      expect(diagnostics[1]?.providerError?.messageRedacted).toBe(true);
      expect(JSON.stringify(diagnostics)).not.toContain("private");
      if (response !== stalled) {
        expect(diagnostics[1]?.errorCode).toBe("PRIVACY_PROVIDER_ERROR");
      }
    }
  });

  it("should distinguish a response read limit from an HTTP rejection", async () => {
    const diagnostics: PrivacyDiagnostic[] = [];
    await expect(
      fetchPrivacyBytes(
        "https://service.test/evidence",
        {},
        {
          fetch: Object.assign(async () => new Response("too-long"), {

          }),
          signal: new AbortController().signal,
          maxBytes: 2,
          operation: "verification-http",
          onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
        },
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_LIMIT_EXCEEDED" });
    expect(diagnostics[1]).toMatchObject({
      status: "failed",
      failure: "response",
      httpStatus: 200,
      errorCode: "PRIVACY_LIMIT_EXCEEDED",
    });
  });

  it("should preserve timeout classification and omit arbitrary transport error codes", async () => {
    const diagnostics: PrivacyDiagnostic[] = [];
    const service = Object.assign(
      async (_input: Parameters<typeof fetch>[0], options?: RequestInit) => {
        return await new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("private timeout detail")),
            { once: true },
          );
        });
      },
      {},
    );
    await expect(
      fetchVerificationResponse("https://verifier.test/quote?private=query", {
        fetch: service,
        signal: new AbortController().signal,
        maxEvidenceBytes: 100,
        pccsURL: "https://verifier.test",
        nrasURL: "https://verifier.test",
        verificationTimeoutMs: 5,
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_TIMEOUT" });
    expect(diagnostics[1]).toMatchObject({
      operation: "verification-http",
      failure: "timeout",
      endpoint: "https://verifier.test/quote",
    });
    diagnostics.length = 0;
    await expect(
      fetchPrivacyBytes(
        "https://verifier.test/quote",
        {},
        {
          fetch: Object.assign(
            async () => {
              throw Object.assign(new Error("private error"), {
                code: "private-code",
              });
            },
            {},
          ),
          signal: new AbortController().signal,
          maxBytes: 100,
          operation: "verification-http",
          onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
        },
      ),
    ).rejects.toThrow();
    expect(diagnostics[1]).not.toHaveProperty("transportCode");
    expect(JSON.stringify(diagnostics)).not.toContain("private");
  });

  it("should identify the hardware check that rejects evidence without exposing the evidence", async () => {
    const diagnostics: PrivacyDiagnostic[] = [];
    await expect(
      verifyHardwareEvidence(
        {
          quote: new Uint8Array(0),
          signingPublicKey: new Uint8Array(0),
          nonce: new Uint8Array(32),
          gpuEvidence: "private-evidence",
        },
        {
          fetch,
          signal: new AbortController().signal,
          maxEvidenceBytes: 100,
          pccsURL: "https://verifier.test",
          nrasURL: "https://verifier.test",
          onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
        },
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_ATTESTATION_FAILED" });
    expect(diagnostics.map((diagnostic) => diagnostic.operation)).toEqual([
      "cpu-verification",
      "cpu-verification",
    ]);
    expect(diagnostics[1]).toMatchObject({
      status: "failed",
      failure: "verification",
      errorCode: "PRIVACY_ATTESTATION_FAILED",
    });
    expect(JSON.stringify(diagnostics)).not.toContain("private-evidence");
    diagnostics.length = 0;
    await tracePrivacyCheck(
      "gpu-verification",
      {
        signal: new AbortController().signal,
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      },
      async () => {},
    );
    expect(diagnostics.map((diagnostic) => diagnostic.status)).toEqual([
      "started",
      "succeeded",
    ]);
  });
});
