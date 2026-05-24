import { describe, expect, it } from "bun:test";
import type { TimelineEvent } from "../timeline.types";
import { projectStepCursor } from "./step-cursor";

const makeStepStart = (
  flowName: string,
  stepName: string,
  index: number,
): TimelineEvent => {
  return {
    type: "step_started",
    ts: new Date().toISOString(),
    flowName,
    stepName,
    agentName: "a",
    index,
  };
};

const makeStepComplete = (
  flowName: string,
  stepName: string,
  index: number,
): TimelineEvent => {
  return {
    type: "step_completed",
    ts: new Date().toISOString(),
    flowName,
    stepName,
    agentName: "a",
    index,
  };
};

describe("projectStepCursor", () => {
  it("should extract completed steps with their index keys", () => {
    const events = [
      makeStepStart("Main", "step0", 0),
      makeStepComplete("Main", "step0", 0),
      makeStepStart("Main", "step1", 1),
    ];

    const cursor = projectStepCursor(events);
    expect(cursor.lastCompletedIndex).toBe(0);
    expect(cursor.completedSteps.has("Main:step0:0")).toBe(true);
    expect(cursor.completedSteps.has("Main:step1:1")).toBe(false);
  });

  it("should return -1 when no steps have completed", () => {
    const events = [makeStepStart("Main", "step0", 0)];

    const cursor = projectStepCursor(events);
    expect(cursor.lastCompletedIndex).toBe(-1);
    expect(cursor.completedSteps.size).toBe(0);
  });
});
