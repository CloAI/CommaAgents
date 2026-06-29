import { describe, expect, it } from "bun:test";
import type { RunOverview } from "../../../../hooks/useChat";
import { createInitialChatRun } from "../../../../hooks/useChat/useChat.utils";
import {
  chatRunHaystack,
  formatDate,
  formatIsoDate,
  itemHaystack,
  persistedHaystack,
} from "./RunPickerPage.utils";

describe("RunPickerPage utils", () => {
  const chatRun = {
    ...createInitialChatRun("chat-1", {}),
    label: "Research",
    strategyName: "Deep Research",
    strategyPath: "/strategies/research.yaml",
  };
  const persisted: RunOverview = {
    runId: "run-1",
    strategyName: "Persisted",
    strategyPath: "/strategies/persisted.yaml",
    cwd: "/workspace",
    status: "completed",
    startedAt: "2026-06-25T12:00:00.000Z",
    completedAt: "2026-06-25T12:01:00.000Z",
  };

  it("builds search haystacks for local and persisted runs", () => {
    expect(chatRunHaystack(chatRun)).toContain(
      "Research Deep Research /strategies/research.yaml chat-1",
    );
    expect(persistedHaystack(persisted)).toBe("Persisted /workspace run-1");
    expect(itemHaystack({ kind: "local", chatRun })).toContain("Research");
    expect(itemHaystack({ kind: "persisted", meta: persisted })).toContain(
      "Persisted",
    );
  });

  it("formats epoch and ISO timestamps consistently", () => {
    const iso = "2026-06-25T12:00:00.000Z";
    expect(formatDate(Date.parse(iso))).toBe(formatIsoDate(iso));
  });
});
