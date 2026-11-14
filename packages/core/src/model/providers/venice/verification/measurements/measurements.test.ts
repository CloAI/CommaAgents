import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  assertTrustedWorkload,
  parseComposeManagerEvidence,
  verifyComposeManagerMeasurements,
  verifyWorkloadMeasurements,
} from "./measurements";
import { replayRuntimeMeasurements } from "./measurements.utils";
import { measurementFixture } from "./test.utils";
import { createPrivacyRuntime } from "../../../../privacy/privacy";
import type { PrivacyWorkloadMismatch } from "../../../../privacy/privacy.types";

describe("hardware-bound software measurement appraisal", () => {
  it("should report exact differences per profile and suppress mismatches when any complete profile matches", () => {
    const { events, report, appCompose } = measurementFixture();
    const measured = verifyWorkloadMeasurements(
      { eventLog: events, appCompose },
      report,
    );
    const actual = { ...measured, composeManagerActionsHash: "ab".repeat(32) };
    const policies = [
      { ...measured, composeHash: "11".repeat(32) },
      { ...actual, osImageHash: "ff".repeat(32) },
    ];
    const failures: PrivacyWorkloadMismatch[] = [];
    expect(() =>
      assertTrustedWorkload(actual, policies, (mismatch) => {
        failures.push(mismatch);
      }),
    ).toThrow("No approved");
    expect(failures).toEqual([
      {
        reason: "measurement-mismatch",
        profiles: [
          {
            profileIndex: 0,
            differences: [
              {
                field: "composeHash",
                expected: "11".repeat(32),
                actual: measured.composeHash,
              },
              {
                field: "composeManagerActionsHash",
                expected: null,
                actual: "ab".repeat(32),
              },
            ],
          },
          {
            profileIndex: 1,
            differences: [
              {
                field: "osImageHash",
                expected: "ff".repeat(32),
                actual: measured.osImageHash,
              },
            ],
          },
        ],
      },
    ]);
    failures.length = 0;
    expect(() =>
      assertTrustedWorkload(
        actual,
        [
          ...policies,
          { ...actual, composeHash: actual.composeHash.toUpperCase() },
        ],
        (mismatch) => {
          failures.push(mismatch);
        },
      ),
    ).not.toThrow();
    expect(failures).toEqual([]);
    expect(() =>
      assertTrustedWorkload(measured, [actual], (mismatch) => {
        failures.push(mismatch);
      }),
    ).toThrow("No approved");
    expect(failures[0]?.profiles[0]?.differences).toEqual([
      {
        field: "composeManagerActionsHash",
        expected: "ab".repeat(32),
        actual: null,
      },
    ]);
  });

  it("should distinguish missing approval from mismatched hashes", () => {
    const { events, report, appCompose } = measurementFixture();
    const measured = verifyWorkloadMeasurements(
      { eventLog: events, appCompose },
      report,
    );
    for (const policies of [undefined, []]) {
      const failures: PrivacyWorkloadMismatch[] = [];
      expect(() =>
        assertTrustedWorkload(measured, policies, (mismatch) => {
          failures.push(mismatch);
        }),
      ).toThrow("No approved");
      expect(failures).toEqual([
        { reason: "no-approved-profiles", profiles: [] },
      ]);
    }
  });

  it("should replay dstack runtime events even when their supplied digests are empty", () => {
    const fixture = measurementFixture();
    expect(
      Buffer.from(replayRuntimeMeasurements(fixture.events).digest).toString(
        "hex",
      ),
    ).toBe(Buffer.from(fixture.report.rtMr3).toString("hex"));
    const measurements = verifyWorkloadMeasurements(
      {
        eventLog: JSON.stringify(fixture.events),
        appCompose: fixture.appCompose,
      },
      fixture.report,
    );
    expect(measurements.composeHash).toBe(fixture.composeHash);
    expect(measurements.osImageHash).toBe(fixture.osImageHash);
    expect(measurements.mrTd).toBe("01".repeat(48));
    expect(() => assertTrustedWorkload(measurements, undefined)).toThrow(
      "No approved software measurement profile",
    );
    expect(() =>
      assertTrustedWorkload(measurements, [
        (({ rtMr3: _runtime, ...policy }) => policy)(measurements),
      ]),
    ).not.toThrow();
  });

  it("should reject altered, omitted, reordered, duplicated, and malformed log evidence", () => {
    const { events, report, appCompose } = measurementFixture();
    const badLogs = [
      events.slice(1),
      [...events].reverse(),
      [...events, events[0]],
      events.map((event) => ({
        ...event,
        event_payload:
          event.event === "compose-hash"
            ? "ff".repeat(32)
            : event.event_payload,
      })),
      events.map((event) => ({ ...event, digest: "ff".repeat(48) })),
      events.map((event) => ({ ...event, event_type: 7 })),
      events.map((event) => ({ ...event, event_payload: "not-hex" })),
      "{bad json",
    ];
    for (const eventLog of badLogs) {
      expect(() =>
        verifyWorkloadMeasurements({ eventLog, appCompose }, report),
      ).toThrow();
    }
    expect(() =>
      verifyWorkloadMeasurements(
        { eventLog: events, appCompose: `${appCompose} ` },
        report,
      ),
    ).toThrow("does not match");
    expect(() => verifyWorkloadMeasurements(undefined, report)).toThrow(
      "unavailable",
    );
    expect(() =>
      verifyWorkloadMeasurements(
        { eventLog: events, appCompose },
        { ...report, mrConfigId: new Uint8Array(48) },
      ),
    ).toThrow("does not match");
  });

  it("should not approve a new boot or deployment based only on its valid evidence", () => {
    const { events, report, appCompose } = measurementFixture();
    const measurements = verifyWorkloadMeasurements(
      { eventLog: events, appCompose },
      report,
    );
    for (const field of [
      "mrTd",
      "rtMr0",
      "rtMr1",
      "rtMr2",
      "appId",
      "keyProviderHash",
      "composeHash",
      "osImageHash",
    ] as const) {
      expect(() =>
        assertTrustedWorkload(measurements, [
          {
            ...measurements,
            [field]: "ff".repeat(
              field === "composeHash" || field === "osImageHash" ? 32 : 48,
            ),
          },
        ]),
      ).toThrow("No approved");
    }
    expect(() =>
      assertTrustedWorkload(
        { ...measurements, composeManagerActionsHash: "ff".repeat(32) },
        [measurements],
      ),
    ).toThrow("No approved");
    expect(() =>
      createPrivacyRuntime({
        trustedWorkloads: {
          "venice/model": [
            {
              mrTd: measurements.mrTd,
              rtMr0: measurements.rtMr0,
              rtMr1: measurements.rtMr1,
              rtMr2: measurements.rtMr2,
              appId: measurements.appId,
              keyProviderHash: measurements.keyProviderHash,
              composeHash: "invalid",
              osImageHash: measurements.osImageHash,
            },
          ],
        },
      }),
    ).toThrow("Invalid protection configuration");
    expect(() =>
      createPrivacyRuntime({ trustedWorkloads: { "venice/model": [] } }),
    ).toThrow("Invalid protection configuration");
  });

  it("should authenticate current compose-manager actions, fresh challenge, and measured guest association", () => {
    const { report, events } = measurementFixture();
    const nonce = new Uint8Array(32).fill(5);
    const actions = [{ image: "image@sha256:example", action: "compose_up" }];
    // Independent canonical representation rather than the production canonicalizer.
    const actionsHash = createHash("sha256")
      .update('[{"action":"compose_up","image":"image@sha256:example"}]')
      .digest("hex");
    const manager = parseComposeManagerEvidence({
      quote: "00",
      nonce: Buffer.from(nonce).toString("hex"),
      actions,
      actions_hash: actionsHash,
      event_log: JSON.stringify(events),
    });
    const managerReport = {
      ...report,
      reportData: Buffer.concat([Buffer.from(actionsHash, "hex"), nonce]),
    };
    expect(
      verifyComposeManagerMeasurements(manager, managerReport, report, nonce),
    ).toBe(actionsHash);
    expect(() =>
      verifyComposeManagerMeasurements(
        { ...manager, actions: [{ action: "changed" }] },
        managerReport,
        report,
        nonce,
      ),
    ).toThrow();
    expect(() =>
      verifyComposeManagerMeasurements(
        manager,
        managerReport,
        report,
        new Uint8Array(32),
      ),
    ).toThrow();
    expect(() =>
      verifyComposeManagerMeasurements(
        manager,
        { ...managerReport, mrTd: new Uint8Array(48) },
        report,
        nonce,
      ),
    ).toThrow();
    expect(() =>
      verifyComposeManagerMeasurements(
        manager,
        { ...managerReport, reportData: new Uint8Array(64) },
        report,
        nonce,
      ),
    ).toThrow();
    expect(() =>
      verifyComposeManagerMeasurements(
        { ...manager, event_log: [] },
        managerReport,
        report,
        nonce,
      ),
    ).toThrow();
  });
});
