import { describe, expect, it } from "vitest";
import { INITIAL_RUN_FEED } from "../useRunChannel/useRunChannel.constants";
import type { RunFeed } from "../useRunChannel";
import {
  canSubmitMessage,
  composerMode,
  composerRecipients,
  pickRecipient,
} from "./useRunComposer.utils";

const input = {
  runId: "run-1",
  inputId: "input-1",
  agentName: "user",
  prompt: "Next?",
};
const agent = {
  runId: "run-1",
  messageId: "m1",
  agentName: "expert",
  createdAt: "",
};
const running: RunFeed = { ...INITIAL_RUN_FEED, status: "running" };
const gate = {
  mode: "steer" as const,
  initialized: true,
  connected: true,
  busy: false,
  strategyAvailable: true,
  recipient: { id: "m1", name: "expert" },
};

describe("composerMode", () => {
  it("should continue any run that is not running", () => {
    expect(composerMode({ ...running, status: "completed" })).toBe("continue");
  });

  it("should reply while an agent waits for input, and steer otherwise", () => {
    expect(composerMode({ ...running, pendingInputs: [input] })).toBe("reply");
    expect(composerMode(running)).toBe("steer");
  });
});

describe("composerRecipients", () => {
  const feed = { ...running, pendingInputs: [input], activeAgents: [agent] };

  it("should list waiting agents when replying and working ones when steering", () => {
    expect(composerRecipients(feed, "reply")).toEqual([
      { id: "input-1", name: "user" },
    ]);
    expect(composerRecipients(feed, "steer")).toEqual([
      { id: "m1", name: "expert" },
    ]);
    expect(composerRecipients(feed, "continue")).toEqual([]);
  });
});

describe("pickRecipient", () => {
  const one = { id: "a", name: "A" };
  const two = { id: "b", name: "B" };

  it("should pick the only recipient without a choice", () => {
    expect(pickRecipient([one], "")).toBe(one);
  });

  it("should require a still-listed choice among several", () => {
    expect(pickRecipient([one, two], "")).toBeUndefined();
    expect(pickRecipient([one, two], "b")).toBe(two);
    expect(pickRecipient([one, two], "gone")).toBeUndefined();
  });
});

describe("canSubmitMessage", () => {
  it("should allow steering a chosen recipient", () => {
    expect(canSubmitMessage(gate)).toBe(true);
  });

  it("should block while loading, disconnected, busy, or without a recipient", () => {
    expect(canSubmitMessage({ ...gate, initialized: false })).toBe(false);
    expect(canSubmitMessage({ ...gate, connected: false })).toBe(false);
    expect(canSubmitMessage({ ...gate, busy: true })).toBe(false);
    expect(canSubmitMessage({ ...gate, recipient: undefined })).toBe(false);
  });

  it("should continue only while the saved strategy is installed", () => {
    const continuing = {
      ...gate,
      mode: "continue" as const,
      recipient: undefined,
    };
    expect(canSubmitMessage(continuing)).toBe(true);
    expect(canSubmitMessage({ ...continuing, strategyAvailable: false })).toBe(
      false,
    );
  });
});
