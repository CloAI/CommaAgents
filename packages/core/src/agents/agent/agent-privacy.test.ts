import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LanguageModel } from "ai";
import {
  registerModel,
  resetModelRegistry,
  resolveModel,
} from "../../model/model";
import type {
  PrivacyRuntime,
  PrivacyRequirements,
  PrivacyReport,
} from "../../model/privacy";
import { createConversationRecord } from "../../conversation-context";
import { createCredentialStore } from "../../credentials/credentials";
import { createJsonFileCredentialBackend } from "../../credentials/backends/json-file";
import {
  getGlobalCredentialStore,
  setGlobalCredentialStore,
} from "../../credentials/global-credential-store";
import { createPrivacyRuntime } from "../../model/privacy";
import {
  resetProviderRegistry,
  getProviderDefinition,
} from "../../model/providers/providers";
import {
  getCatalogSnapshot,
  resetCatalog,
} from "../../model/providers/catalog/catalog";
import {
  getCatalogCachePath,
  setCatalogCachePath,
} from "../../defaults/defaults";
import { hookIntoAgent } from "../hook-into-agent/hook-into-agent";
import { loadAgentFromString } from "../loader/loader";
import { loadStrategyFromString } from "../../strategy/loader/loader";
import { createAgent } from "./agent";

const requirements = { tee: "required", e2ee: "required" } as const;

function createTestModel(
  onRequest: (signal?: AbortSignal) => void | Promise<void> = () => {},
): LanguageModel {
  const usage = {
    inputTokens: {
      total: 2,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 1, text: undefined, reasoning: undefined },
  };
  return {
    specificationVersion: "v3",
    provider: "protected-test",
    modelId: "text-model",
    supportedUrls: {},
    async doGenerate(options) {
      await onRequest(options.abortSignal);
      return {
        content: [{ type: "text", text: "summary" }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      };
    },
    async doStream(options) {
      await onRequest(options.abortSignal);
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "answer" });
            controller.enqueue({
              type: "text-delta",
              id: "answer",
              delta: "answer",
            });
            controller.enqueue({ type: "text-end", id: "answer" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage,
            });
            controller.close();
          },
        }),
      };
    },
  };
}

afterEach(() => resetModelRegistry());

describe("protected model resolution", () => {
  it("should reject explicit null requirements instead of falling back to ordinary inference", async () => {
    registerModel("mock/plain", createTestModel());
    const invalid = null as unknown as PrivacyRequirements;
    await expect(
      resolveModel("mock/plain", { privacy: invalid }),
    ).rejects.toMatchObject({ code: "PRIVACY_CONFIGURATION_ERROR" });
    expect(() =>
      createAgent({ name: "writer", model: "mock/plain", privacy: invalid }),
    ).toThrow("Invalid protection configuration");
  });
  it("should enforce requirements before the direct model registry and forward invocation options", async () => {
    const registered = createTestModel();
    const protectedModel = createTestModel();
    registerModel("venice/text-model", registered);
    const requests: {
      model: string;
      privacy: PrivacyRequirements;
      signal?: AbortSignal;
    }[] = [];
    const privacyRuntime: PrivacyRuntime = {
      async resolveModel(model, privacy, options) {
        requests.push({ model, privacy, signal: options?.signal });
        return protectedModel;
      },
    };
    const signal = new AbortController().signal;
    expect(
      await resolveModel("venice/text-model", {
        privacy: requirements,
        privacyRuntime,
        signal,
      }),
    ).toBe(protectedModel);
    expect(requests).toEqual([
      { model: "venice/text-model", privacy: requirements, signal },
    ]);
    expect(await resolveModel("venice/text-model")).toBe(registered);
  });

  it("should reject missing runtimes, implicit providers, and invalid requirements before inference", async () => {
    registerModel("venice/text-model", createTestModel());
    await expect(
      resolveModel("venice/text-model", { privacy: requirements }),
    ).rejects.toMatchObject({ code: "PRIVACY_CONFIGURATION_ERROR" });
    await expect(
      resolveModel("text-model", { privacy: requirements }),
    ).rejects.toMatchObject({ code: "PRIVACY_CONFIGURATION_ERROR" });
    await expect(
      resolveModel("venice/text-model", { privacy: { e2ee: "required" } }),
    ).rejects.toMatchObject({ code: "PRIVACY_CONFIGURATION_ERROR" });
  });

  it("should reject cancelled setup before invoking the privacy runtime", async () => {
    let calls = 0;
    const privacyRuntime: PrivacyRuntime = {
      async resolveModel() {
        calls++;
        return createTestModel();
      },
    };
    const controller = new AbortController();
    controller.abort();
    await expect(
      resolveModel("venice/text-model", {
        privacy: requirements,
        privacyRuntime,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });
});

describe("agent privacy propagation", () => {
  it("should reject invalid real-runtime attestation without publishing completion hooks or history", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-privacy-failure-"));
    const previousStore = getGlobalCredentialStore();
    const previousCatalogPath = getCatalogCachePath();
    const catalog = getCatalogSnapshot();
    setCatalogCachePath(join(directory, "catalog.json"));
    resetCatalog();
    const store = createCredentialStore({
      backend: createJsonFileCredentialBackend({
        filePath: join(directory, "credentials.json"),
      }),
      env: {},
    });
    await store.set("venice", "$global", {
      type: "api",
      key: "private-test-key",
    });
    setGlobalCredentialStore(store);
    resetProviderRegistry();
    const request = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(catalog))
      .mockResolvedValue(
        Response.json({ invalid: "untrusted-attestation-body" }),
      );
    await getProviderDefinition("venice");
    request.mockClear();
    const completed: string[] = [];
    const emitted: string[] = [];
    const agent = createAgent(
      { name: "writer", model: "venice/text-model", privacy: requirements },
      { privacyRuntime: createPrivacyRuntime() },
    );
    hookIntoAgent(agent, {
      onCallCompleted: [
        (result) => {
          completed.push(result.text);
        },
      ],
      onStreamEvent: [
        (event) => {
          emitted.push(event.type);
        },
      ],
    });
    try {
      await expect(agent.call("private user content")).rejects.toMatchObject({
        cause: { code: "PRIVACY_ATTESTATION_FAILED" },
      });
      expect(completed).toEqual([]);
      expect(agent.getConversationContext!().records()).toEqual([]);
      expect(emitted).not.toContain("done");
      expect(emitted).not.toContain("text");
      expect(request).toHaveBeenCalledTimes(1);
      expect(String(request.mock.calls[0]?.[0])).toContain("/tee/attestation?");
    } finally {
      request.mockRestore();
      setGlobalCredentialStore(previousStore);
      setCatalogCachePath(previousCatalogPath);
      resetCatalog();
      resetProviderRegistry();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("should cancel protected compaction before starting the main inference request", async () => {
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let resolutions = 0;
    const privacyRuntime: PrivacyRuntime = {
      async resolveModel() {
        resolutions++;
        return createTestModel(
          (signal) =>
            new Promise<void>((_resolve, reject) => {
              if (!signal)
                throw new Error("Expected summarizer cancellation signal");
              signal.addEventListener(
                "abort",
                () => reject(new Error("Cancelled summarization")),
                { once: true },
              );
              markStarted();
            }),
        );
      },
    };
    const agent = createAgent(
      {
        name: "writer",
        model: "venice/text-model",
        privacy: requirements,
        context: { compaction: { threshold: 2, keepRecent: 1 } },
      },
      { privacyRuntime },
    );
    agent.getConversationContext!().importRecords(
      ["first", "second", "third"].map((text) =>
        createConversationRecord({
          agentName: "writer",
          userMessage: text,
          responseMessages: [],
          text,
          usage: { promptTokens: 1, completionTokens: 1 },
          finishReason: "stop",
        }),
      ),
    );
    const pending = agent.call("next");
    await started;
    pending.abort();
    await expect(pending).rejects.toThrow();
    expect(resolutions).toBe(1);
  });
  it("should reject protected custom execution and custom summarization", () => {
    expect(() =>
      createAgent({
        name: "custom",
        privacy: requirements,
        execute: async () => "unsafe",
      }),
    ).toThrow();
    expect(() =>
      createAgent({
        name: "summary",
        model: "venice/text-model",
        privacy: requirements,
        context: { compaction: { summarize: async () => "unsafe" } },
      }),
    ).toThrow();
  });

  it("should reject incomplete privacy requirements in declarative agent files", async () => {
    await expect(
      loadAgentFromString(
        JSON.stringify({
          name: "writer",
          model: "venice/text-model",
          privacy: { e2ee: "required" },
        }),
        "json",
      ),
    ).rejects.toThrow();
    await expect(
      loadStrategyFromString(
        JSON.stringify({
          name: "private-strategy",
          version: "1",
          agents: {
            writer: {
              model: "venice/text-model",
              privacy: { e2ee: "required" },
            },
          },
          flow: {
            name: "main",
            type: "sequential",
            steps: [{ agent: "writer" }],
          },
        }),
        "json",
      ),
    ).rejects.toThrow();
  });

  it("should apply the same requirements and cancellation to summarization and inference", async () => {
    const requested: PrivacyRequirements[] = [];
    const signals: (AbortSignal | undefined)[] = [];
    const reports: PrivacyReport[] = [];
    const privacyRuntime: PrivacyRuntime = {
      async resolveModel(_model, privacy, options) {
        requested.push(privacy);
        return createTestModel((signal) => {
          signals.push(signal);
          const report: PrivacyReport = {
            requestId: String(reports.length + 1),
            providerId: "venice",
            modelId: "text-model",
            requirements: privacy,
            status: "verified",
            startedAt: "2026-10-25T00:00:00.000Z",
            checkedAt: "2026-10-25T00:00:01.000Z",
            checks: {
              cpu: "passed",
              gpu: "passed",
              freshness: "passed",
              keyBinding: "passed",
              responseBinding: "passed",
              encryption: "passed",
              workload: "passed",
            },
          };
          reports.push(report);
          options?.onReport?.(report);
        });
      },
    };
    const agent = createAgent(
      {
        name: "writer",
        model: "venice/text-model",
        privacy: requirements,
        context: { compaction: { threshold: 2, keepRecent: 1 } },
      },
      { privacyRuntime },
    );
    agent.getConversationContext!().importRecords(
      ["first", "second", "third"].map((text) =>
        createConversationRecord({
          agentName: "writer",
          userMessage: text,
          responseMessages: [],
          text,
          usage: { promptTokens: 1, completionTokens: 1 },
          finishReason: "stop",
        }),
      ),
    );
    const result = await agent.call("next");
    expect(result.text).toBe("answer");
    expect(result.privacyReports).toEqual(reports);
    expect(result.privacyReports).toHaveLength(2);
    expect(requested).toEqual([requirements, requirements]);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).toBe(signals[0]);
  });

  it("should preserve privacy requirements and runtime through standalone and strategy loaders", async () => {
    const requested: PrivacyRequirements[] = [];
    const privacyRuntime: PrivacyRuntime = {
      async resolveModel(_model, privacy) {
        requested.push(privacy);
        return createTestModel();
      },
    };
    const description = {
      name: "writer",
      model: "venice/text-model",
      privacy: requirements,
    };
    const standalone = await loadAgentFromString(
      JSON.stringify(description),
      "json",
      { privacyRuntime },
    );
    expect((await standalone.call("question")).text).toBe("answer");
    const strategy = await loadStrategyFromString(
      JSON.stringify({
        name: "private-strategy",
        version: "1",
        agents: { writer: { model: description.model, privacy: requirements } },
        flow: {
          name: "private-flow",
          type: "sequential",
          steps: [{ agent: "writer" }],
        },
      }),
      "json",
      { privacyRuntime },
    );
    expect((await strategy.agents.writer!.call("question")).text).toBe(
      "answer",
    );
    expect(requested).toEqual([requirements, requirements]);
  });
});
