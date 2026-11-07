import { discoverStrategies } from "@comma-agents/core/strategy";
import {
  createDaemonKernel,
  loadDaemonConfig,
  RunPhase,
  type PluginRunSnapshot,
} from "@comma-agents/daemon";
import {
  AUTO_ANSWER,
  DEFAULT_CONTINUATION_INPUT,
  DEFAULT_MAX_USER_TURNS,
} from "./run.constants";
import type {
  HeadlessAgentOutput,
  HeadlessRunOptions,
  HeadlessRunResult,
} from "./run.types";
import { agentMessageText, resolveStrategy } from "./run.utils";

/**
 * Run one strategy to completion in-process, without a daemon server or terminal UI.
 *
 * The first user turn receives `input`. When the strategy asks for another user turn
 * after `maxUserTurns` have been used, the run is stopped and the stage is treated as
 * finished. Each `then` strategy is then selected with a strategy switch in the same
 * conversation and continued with `thenInput`. Tool questions are answered
 * automatically, and sandbox permission requests receive the configured approval.
 *
 * @param {HeadlessRunOptions} options - Strategy, input, and unattended-run policy.
 * @returns {Promise<HeadlessRunResult>} Terminal outcome with every agent text message.
 * @example
 * ```ts
 * const result = await runHeadless({ strategy: "Plan", input: "Add retries", then: ["Build"], approve: "allow" });
 * console.log(result.status, result.outputs.at(-1)?.text);
 * ```
 */
export async function runHeadless({
  strategy,
  input,
  cwd = process.cwd(),
  modelRoles,
  maxUserTurns = DEFAULT_MAX_USER_TURNS,
  approve = "deny",
  then = [],
  thenInput = DEFAULT_CONTINUATION_INPUT,
  json = false,
}: HeadlessRunOptions): Promise<HeadlessRunResult> {
  const { strategies } = await discoverStrategies({ cwd });
  const stages = [strategy, ...then].map((name) =>
    resolveStrategy(name, cwd, strategies),
  );
  const config = loadDaemonConfig();
  const kernel = await createDaemonKernel({
    runs: {
      runsDir: config.runsDir,
      harness: { instructionFiles: config.instructionFiles },
    },
    modelRoles: config.modelRoles,
  });
  const { runs, questions, sandbox } = kernel.plugins;
  const outputs: HeadlessAgentOutput[] = [];
  const usage = { promptTokens: 0, completionTokens: 0 };
  const unsubscribers: Array<() => void> = [];
  let userTurns = 1;
  let reachedTurnLimit = false;
  let autoAnsweredQuestions = 0;
  let permissionRequests = 0;
  let terminalWaiter: PromiseWithResolvers<PluginRunSnapshot> | undefined;
  let continuationRunning = false;

  try {
    const prepared = await runs.prepareRun({
      configuration: {
        ...stages[0]!,
        cwd,
        ...(modelRoles === undefined ? {} : { modelRoles }),
      },
    });
    const { runId } = prepared;
    unsubscribers.push(
      await runs.notifications.subscribe(
        "run_message_output",
        runId,
        ({ message }) => {
          if (
            message.role === "agent" &&
            message.status === "completed" &&
            message.usage
          ) {
            usage.promptTokens += message.usage.promptTokens;
            usage.completionTokens += message.usage.completionTokens;
          }
          const text = agentMessageText(message);
          if (text === undefined || message.role !== "agent") {
            return;
          }
          outputs.push({
            agentName: message.agentName,
            runId: message.runId,
            text,
          });
          if (!json) {
            process.stdout.write(`\n[${message.agentName}]\n${text}\n`);
          }
        },
      ),
      await runs.notifications.subscribe(
        "run_input_requested",
        runId,
        (request) => {
          if (request.runId !== runId) {
            return;
          }
          if (userTurns >= maxUserTurns) {
            reachedTurnLimit = true;
            void runs.stopRun(runId);
            return;
          }
          userTurns += 1;
          void runs.resolveInput(request.runId, request.inputId, AUTO_ANSWER);
        },
      ),
      // Continuations started with sendRun expose no completion promise; their end is the next terminal snapshot after running.
      await runs.notifications.subscribe(
        "run_snapshot",
        runId,
        ({ snapshot }) => {
          if (snapshot.runId !== runId || terminalWaiter === undefined) {
            return;
          }
          if (snapshot.phase === RunPhase.running) {
            continuationRunning = true;
          }
          if (snapshot.phase === RunPhase.terminal && continuationRunning) {
            terminalWaiter.resolve(snapshot);
          }
        },
      ),
      await questions.notifications.subscribe(
        "run_question_requested",
        runId,
        (request) => {
          autoAnsweredQuestions += 1;
          questions.resolveQuestion(
            request.runId,
            request.requestId,
            AUTO_ANSWER,
          );
        },
      ),
      await sandbox.notifications.subscribe(
        "run_permission_requested",
        runId,
        (request) => {
          permissionRequests += 1;
          sandbox.resolvePermission(request.runId, request.requestId, approve);
        },
      ),
    );
    const firstOutcome = await runs.startRun(runId, input).completion;
    let status: string = firstOutcome.status;
    for (const stage of stages.slice(1)) {
      if (status === "failed" || (status === "stopped" && !reachedTurnLimit)) {
        break;
      }
      userTurns = 1;
      reachedTurnLimit = false;
      continuationRunning = false;
      terminalWaiter = Promise.withResolvers<PluginRunSnapshot>();
      await runs.switchStrategy({ runId, ...stage });
      const submission = await runs.sendRun({ runId, input: thenInput });
      if (submission.type === "context_required") {
        await runs.sendRun({
          runId,
          input: thenInput,
          contextChoice: "compact",
        });
      }
      const terminal = await terminalWaiter.promise;
      status =
        terminal.phase === RunPhase.terminal ? terminal.outcome.status : status;
      terminalWaiter = undefined;
    }
    const result: HeadlessRunResult = {
      runId,
      status,
      endedBy: reachedTurnLimit ? "turn-limit" : "strategy",
      outputs,
      autoAnsweredQuestions,
      permissionRequests,
      usage,
    };
    if (json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
    return result;
  } finally {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
    await kernel.dispose();
  }
}
