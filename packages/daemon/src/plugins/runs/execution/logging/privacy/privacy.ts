import { readFileSync } from "node:fs";
import type { PrivacyRuntimeOptions } from "@comma-agents/core";
import { createPrivacyRuntime } from "@comma-agents/core";
import { getLogger } from "@logtape/logtape";
import type { RunPreparationContext } from "../../../runs.types";

const logger = getLogger(["comma", "daemon", "execution", "privacy"]);

/**
 * Create a run-owned privacy runtime that logs content-free protection outcomes.
 * @param {RunPreparationContext} context - Root or child run identity.
 * @returns {ReturnType<typeof createPrivacyRuntime>} Protected model resolver with diagnostic observers.
 * @internal
 */
export function createExecutionPrivacyRuntime(context: RunPreparationContext) {
  const runLogger = logger.with({
    runId: context.runId,
    ...(context.kind === "child" ? { parentRunId: context.parentRunId } : {}),
  });
  const profilesPath = process.env.COMMA_PRIVACY_TRUSTED_WORKLOADS_FILE;
  let trustedWorkloads: PrivacyRuntimeOptions["trustedWorkloads"];
  if (profilesPath) {
    try {
      trustedWorkloads = JSON.parse(
        readFileSync(profilesPath, "utf8"),
      ) as PrivacyRuntimeOptions["trustedWorkloads"];
    } catch {
      throw new Error("Cannot load approved privacy workload profiles.");
    }
  }
  return createPrivacyRuntime({
    trustedWorkloads,
    providers: {
      venice: {
        allowUnboundReceipts:
          process.env.COMMA_VENICE_ALLOW_UNBOUND_RECEIPTS === "true",
      },
    },
    onEvent(event) {
      const properties = {
        requestId: event.requestId,
        providerId: event.providerId,
        modelId: event.modelId,
        phase: event.phase,
      };
      if (event.diagnostic) {
        const diagnostic = event.diagnostic;
        const details = {
          ...properties,
          operation: diagnostic.operation,
          status: diagnostic.status,
          endpoint: diagnostic.endpoint,
          requestHeaders: diagnostic.requestHeaders,
          queryParams: diagnostic.queryParams,
          method: diagnostic.method,
          authenticated: diagnostic.authenticated,
          httpStatus: diagnostic.httpStatus,
          ...(diagnostic.providerError
            ? { providerError: diagnostic.providerError }
            : {}),
          durationMs: diagnostic.durationMs,
          failure: diagnostic.failure,
          ...(diagnostic.workloadMismatch
            ? { workloadMismatch: diagnostic.workloadMismatch }
            : {}),
          ...(diagnostic.failureReason
            ? { failureReason: diagnostic.failureReason }
            : {}),
          errorCode: diagnostic.errorCode,
          transportCode: diagnostic.transportCode,
          ...(diagnostic.verificationSteps
            ? { verificationSteps: diagnostic.verificationSteps }
            : {}),
          ...(diagnostic.measurements
            ? { measurements: diagnostic.measurements }
            : {}),
        };
        if (diagnostic.status === "failed") {
          runLogger.error("Privacy operation failed", details);
        } else {
          runLogger.debug(
            diagnostic.status === "started"
              ? "Privacy operation started"
              : "Privacy operation completed",
            details,
          );
        }
        return;
      }
      if (event.report === undefined) {
        runLogger.debug("Privacy verification progress", properties);
        return;
      }
      const report = event.report;
      const outcome = {
        ...properties,
        requirements: report.requirements,
        status: report.status,
        startedAt: report.startedAt,
        checkedAt: report.checkedAt,
        checks: report.checks,
        ...(report.freshnessExpiresAt
          ? { freshnessExpiresAt: report.freshnessExpiresAt }
          : {}),
        ...(report.verificationSteps
          ? { verificationSteps: report.verificationSteps }
          : {}),
        ...(report.workloadMismatch
          ? { workloadMismatch: report.workloadMismatch }
          : {}),
        ...(report.receiptChecks
          ? { receiptChecks: report.receiptChecks }
          : {}),
        ...(report.workloadMeasurements
          ? { workloadMeasurements: report.workloadMeasurements }
          : {}),
        ...(report.downstreamVerification
          ? { downstreamVerification: report.downstreamVerification }
          : {}),
        ...(report.gpuAssociation
          ? { gpuAssociation: report.gpuAssociation }
          : {}),
        ...(report.errorCode ? { errorCode: report.errorCode } : {}),
      };
      if (report.status === "verified") {
        runLogger.debug("Privacy verification passed", outcome);
      } else if (report.status === "degraded") {
        runLogger.error(
          "Privacy verification degraded: continuing without verified conversation binding",
          outcome,
        );
      } else {
        runLogger.error("Privacy verification rejected", outcome);
      }
    },
  });
}
