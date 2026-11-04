import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, spyOn } from "bun:test";
import * as core from "@comma-agents/core";
import type { PrivacyEvent, PrivacyReport } from "@comma-agents/core";
import { withConfig, type LogRecord } from "@logtape/logtape";
import { generateText } from "ai";
import { initializeLogging } from "../../../../../logger";
import { createExecutionPrivacyRuntime } from "./privacy";

const scope = {
  kind: "child" as const,
  runId: "child",
  parentRunId: "root",
  cwd: "/work",
  strategyPath: "/work/strategy.json",
  signal: new AbortController().signal,
};

async function capture(run: () => Promise<void>): Promise<LogRecord[]> {
  const records: LogRecord[] = [];
  const logging = initializeLogging({ stderr: false });
  try {
    await withConfig(
      {
        sinks: {
          capture: (record) => {
            records.push(record);
          },
        },
        loggers: [
          { category: ["comma"], lowestLevel: "debug", sinks: ["capture"] },
        ],
      },
      run,
    );
  } finally {
    logging.close();
  }
  return records;
}

describe("createExecutionPrivacyRuntime", () => {
  it("should retain provider verification steps in operation and rejection logs", async () => {
    let observe: ((event: PrivacyEvent) => void) | undefined;
    const factory = spyOn(core, "createPrivacyRuntime").mockImplementation(
      (options) => {
        observe = options?.onEvent;
        return {
          async resolveModel() {
            throw new Error("unused");
          },
        };
      },
    );
    const verificationSteps = {
      fetchDigest: "passed",
      verifyEnclave: "passed",
      verifyCode: "failed",
      compareMeasurements: "unavailable",
    } as const;
    const report: PrivacyReport = {
      requestId: "sdk-request",
      providerId: "tinfoil",
      modelId: "test",
      requirements: { tee: "required", e2ee: "required" },
      status: "rejected",
      startedAt: "2026-11-03T00:00:00Z",
      checkedAt: "2026-11-03T00:00:01Z",
      checks: {
        cpu: "passed",
        gpu: "unavailable",
        freshness: "unavailable",
        workload: "failed",
        keyBinding: "unavailable",
        responseBinding: "unavailable",
        encryption: "unavailable",
      },
      verificationSteps,
      errorCode: "PRIVACY_ATTESTATION_FAILED",
    };
    try {
      const records = await capture(async () => {
        createExecutionPrivacyRuntime(scope);
        observe?.({
          requestId: report.requestId,
          providerId: "tinfoil",
          modelId: "test",
          phase: "attestation",
          diagnostic: {
            operation: "attestation",
            status: "failed",
            verificationSteps,
            failureReason: "verifyCode",
            errorCode: "PRIVACY_ATTESTATION_FAILED",
          },
        });
        observe?.({
          requestId: report.requestId,
          providerId: "tinfoil",
          modelId: "test",
          phase: "rejected",
          report,
        });
      });
      expect(records[0]?.properties).toMatchObject({
        verificationSteps,
        failureReason: "verifyCode",
      });
      expect(records[1]?.properties).toMatchObject({
        verificationSteps,
        checks: report.checks,
      });
    } finally {
      factory.mockRestore();
    }
  });

  it("should enable the receipt exception only through the explicit environment setting", () => {
    const previous = process.env.COMMA_VENICE_ALLOW_UNBOUND_RECEIPTS;
    const factory = spyOn(core, "createPrivacyRuntime").mockImplementation(
      () => ({
        async resolveModel() {
          throw new Error("unused");
        },
      }),
    );
    try {
      for (const value of [undefined, "false", "true"] as const) {
        if (value === undefined) {
          delete process.env.COMMA_VENICE_ALLOW_UNBOUND_RECEIPTS;
        } else {
          process.env.COMMA_VENICE_ALLOW_UNBOUND_RECEIPTS = value;
        }
        createExecutionPrivacyRuntime(scope);
        expect(
          factory.mock.calls.at(-1)?.[0]?.providers?.venice
            ?.allowUnboundReceipts,
        ).toBe(value === "true");
      }
    } finally {
      factory.mockRestore();
      if (previous === undefined) {
        delete process.env.COMMA_VENICE_ALLOW_UNBOUND_RECEIPTS;
      } else {
        process.env.COMMA_VENICE_ALLOW_UNBOUND_RECEIPTS = previous;
      }
    }
  });

  it("should load approved profiles from an explicit file and reject unreadable or invalid files", () => {
    const directory = mkdtempSync(join(tmpdir(), "comma-workload-policy-"));
    const file = join(directory, "approved.json");
    const previous = process.env.COMMA_PRIVACY_TRUSTED_WORKLOADS_FILE;
    try {
      process.env.COMMA_PRIVACY_TRUSTED_WORKLOADS_FILE = file;
      expect(() => createExecutionPrivacyRuntime(scope)).toThrow(
        "Cannot load approved privacy workload profiles",
      );
      writeFileSync(file, '{"venice/model":[]}');
      expect(() => createExecutionPrivacyRuntime(scope)).toThrow(
        "Invalid protection configuration",
      );
      writeFileSync(file, "invalid json");
      expect(() => createExecutionPrivacyRuntime(scope)).toThrow(
        "Cannot load approved privacy workload profiles",
      );
      const approved = {
        "venice/model": [
          {
            mrTd: "01".repeat(48),
            rtMr0: "02".repeat(48),
            rtMr1: "03".repeat(48),
            rtMr2: "04".repeat(48),
            appId: "05".repeat(20),
            keyProviderHash: "06".repeat(32),
            composeHash: "07".repeat(32),
            osImageHash: "08".repeat(32),
          },
        ],
      };
      writeFileSync(file, JSON.stringify(approved));
      const factory = spyOn(core, "createPrivacyRuntime");
      try {
        createExecutionPrivacyRuntime(scope);
        expect(factory.mock.calls[0]?.[0]?.trustedWorkloads).toEqual(approved);
      } finally {
        factory.mockRestore();
      }
    } finally {
      if (previous === undefined) {
        delete process.env.COMMA_PRIVACY_TRUSTED_WORKLOADS_FILE;
      } else {
        process.env.COMMA_PRIVACY_TRUSTED_WORKLOADS_FILE = previous;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("should distinguish verified TEE/E2EE, TEE-only and rejected partial verification", async () => {
    let observe: ((event: PrivacyEvent) => void) | undefined;
    const runtime = spyOn(core, "createPrivacyRuntime").mockImplementation(
      (options) => {
        observe = options?.onEvent;
        return {
          async resolveModel() {
            throw new Error("unused");
          },
        };
      },
    );
    try {
      for (const mode of [
        "encrypted",
        "tee-only",
        "rejected",
        "degraded",
      ] as const) {
        const report: PrivacyReport = {
          requestId: "request-1",
          providerId: "venice",
          modelId: "model",
          requirements:
            mode === "tee-only"
              ? { tee: "required" }
              : { tee: "required", e2ee: "required" },
          status:
            mode === "rejected"
              ? "rejected"
              : mode === "degraded"
                ? "degraded"
                : "verified",
          startedAt: "2026-11-01T00:00:00Z",
          checkedAt: "2026-11-01T00:00:01Z",
          ...(mode === "rejected"
            ? {
                workloadMismatch: {
                  reason: "measurement-mismatch" as const,
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
                },
              }
            : {}),
          receiptChecks: {
            signature: "passed",
            completionId: "passed",
            requestBody:
              mode === "rejected" || mode === "degraded" ? "failed" : "passed",
            responseBody:
              mode === "rejected" || mode === "degraded" ? "failed" : "passed",
          },
          checks: {
            cpu: "passed",
            gpu: "passed",
            freshness: "passed",
            keyBinding: "passed",
            responseBinding:
              mode === "rejected" || mode === "degraded" ? "failed" : "passed",
            encryption: mode === "tee-only" ? "notApplicable" : "passed",
            workload: "unavailable",
          },
          ...(mode === "rejected"
            ? { errorCode: "PRIVACY_RESPONSE_AUTHENTICATION_FAILED" as const }
            : {}),
        };
        const records = await capture(async () => {
          createExecutionPrivacyRuntime(scope);
          observe?.({
            requestId: report.requestId,
            providerId: "venice",
            modelId: "model",
            phase: "attestation",
          });
          observe?.({
            requestId: report.requestId,
            providerId: "venice",
            modelId: "model",
            phase: report.status,
            report,
          });
        });
        expect(records[0]?.rawMessage).toBe("Privacy verification progress");
        expect(records[1]?.rawMessage).toBe(
          mode === "rejected"
            ? "Privacy verification rejected"
            : mode === "degraded"
              ? "Privacy verification degraded: continuing without verified conversation binding"
              : "Privacy verification passed",
        );
        expect(records[1]?.level).toBe(
          mode === "rejected" || mode === "degraded" ? "error" : "debug",
        );
        expect(records[1]?.properties).toMatchObject({
          runId: "child",
          parentRunId: "root",
          requestId: "request-1",
          checks: report.checks,
          receiptChecks: report.receiptChecks,
          requirements: report.requirements,
          status: report.status,
        });
        expect(records[1]?.properties.workloadMismatch).toEqual(
          report.workloadMismatch,
        );
      }
    } finally {
      runtime.mockRestore();
    }
  });

  it.each([401, 502, "network"] as const)(
    "should identify attestation HTTP and transport failures (%s) without leaking payloads",
    async (failure) => {
      const originalFetch = globalThis.fetch;
      const credential = spyOn(
        core.getGlobalCredentialStore(),
        "resolve",
      ).mockResolvedValue({ type: "api", key: "secret-key" });
      const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
        Object.assign(
          async (
            _input: Parameters<typeof fetch>[0],
            init?: Parameters<typeof fetch>[1],
          ) => {
            expect(new Headers(init?.headers).get("Authorization")).toBe(
              "Bearer secret-key",
            );
            if (failure === "network") {
              throw new TypeError("secret transport details", {
                cause: Object.assign(new Error("secret cause"), {
                  code: "ECONNRESET",
                }),
              });
            }
            return new Response("secret provider body", { status: failure });
          },
          { preconnect: originalFetch.preconnect },
        ),
      );
      try {
        const records = await capture(async () => {
          const model = await createExecutionPrivacyRuntime(scope).resolveModel(
            "venice/model",
            { tee: "required" },
          );
          await expect(
            generateText({ model, prompt: "secret-prompt", maxRetries: 0 }),
          ).rejects.toThrow();
        });
        const started = records.find(
          (record) => record.rawMessage === "Privacy operation started",
        );
        const rejected = records.find(
          (record) => record.rawMessage === "Privacy operation failed",
        );
        expect(started?.properties).toMatchObject({
          operation: "attestation",
          endpoint: "https://api.venice.ai/api/v1/tee/attestation",
          method: "GET",
          authenticated: true,
          requestHeaders: { authorization: "Bearer [REDACTED]" },
          queryParams: {
            model: ["model"],
            nonce: [expect.stringMatching(/^[0-9a-f]{64}$/)],
          },
        });
        expect(rejected?.level).toBe("error");
        expect(rejected?.properties).toMatchObject({
          runId: "child",
          parentRunId: "root",
          operation: "attestation",
          status: "failed",
          failure: failure === "network" ? "network" : "http",
          errorCode: "PRIVACY_PROVIDER_ERROR",
          ...(failure === "network"
            ? { transportCode: "ECONNRESET" }
            : { httpStatus: failure }),
        });
        expect(rejected?.properties.durationMs).toEqual(expect.any(Number));
        expect(rejected?.properties.requestId).toBe(
          started?.properties.requestId,
        );
        for (const secret of [
          "secret-key",
          "secret-prompt",
          "secret provider body",
          "secret transport details",
          "secret cause",
          "nonce=",
          "?model=",
        ]) {
          expect(JSON.stringify(records)).not.toContain(secret);
        }
      } finally {
        fetchMock.mockRestore();
        credential.mockRestore();
      }
    },
  );

  it("should include sanitized structured provider errors in failed operation logs", async () => {
    const originalFetch = globalThis.fetch;
    const credential = spyOn(
      core.getGlobalCredentialStore(),
      "resolve",
    ).mockResolvedValue({ type: "api", key: "secret-key" });
    const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async () =>
          Response.json(
            {
              error: {
                code: "invalid_request_error",
                param: "nonce",
                message: "Nonce must be exactly 32 bytes: secret-prompt",
                raw: "secret-provider-body",
              },
            },
            { status: 400 },
          ),
        { preconnect: originalFetch.preconnect },
      ),
    );
    try {
      const records = await capture(async () => {
        const model = await createExecutionPrivacyRuntime(scope).resolveModel(
          "venice/model",
          { tee: "required" },
        );
        await expect(
          generateText({ model, prompt: "secret-prompt", maxRetries: 0 }),
        ).rejects.toThrow();
      });
      const failure = records.find(
        (record) => record.rawMessage === "Privacy operation failed",
      );
      expect(failure?.properties).toMatchObject({
        httpStatus: 400,
        providerError: {
          code: "invalid_request_error",
          param: "nonce",
          message: "Provider rejected the attestation nonce format or length.",
          messageRedacted: true,
        },
      });
      for (const secret of [
        "secret-key",
        "secret-prompt",
        "secret-provider-body",
      ]) {
        expect(JSON.stringify(records)).not.toContain(secret);
      }
    } finally {
      fetchMock.mockRestore();
      credential.mockRestore();
    }
  });

  it("should log real attestation rejection without prompt, credentials or raw evidence", async () => {
    const originalFetch = globalThis.fetch;
    const credential = spyOn(
      core.getGlobalCredentialStore(),
      "resolve",
    ).mockResolvedValue({ type: "api", key: "secret-key" });
    const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (input: Parameters<typeof fetch>[0]) => {
          const url = new URL(String(input));
          expect(url.pathname).toBe("/api/v1/tee/attestation");
          return Response.json({
            model: "model",
            nonce: url.searchParams.get("nonce"),
            signing_key: `04${"00".repeat(64)}`,
            evidence: "secret-evidence",
          });
        },
        { preconnect: originalFetch.preconnect },
      ),
    );
    try {
      const records = await capture(async () => {
        const model = await createExecutionPrivacyRuntime(scope).resolveModel(
          "venice/model",
          { tee: "required", e2ee: "required" },
        );
        await expect(
          generateText({ model, prompt: "secret-prompt", maxRetries: 0 }),
        ).rejects.toThrow();
      });
      const rejection = records.find(
        (record) => record.rawMessage === "Privacy verification rejected",
      );
      expect(rejection?.properties).toMatchObject({
        runId: "child",
        providerId: "venice",
        modelId: "model",
        status: "rejected",
        errorCode: "PRIVACY_ATTESTATION_FAILED",
        checks: { encryption: "unavailable", responseBinding: "unavailable" },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      for (const secret of [
        "secret-key",
        "secret-prompt",
        "secret-evidence",
        "signing_key",
        "intel_quote",
      ]) {
        expect(JSON.stringify(records)).not.toContain(secret);
      }
    } finally {
      fetchMock.mockRestore();
      credential.mockRestore();
    }
  });
});
