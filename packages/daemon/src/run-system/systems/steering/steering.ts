import type {
  DaemonSystem,
  StrategyLoadedContext,
  SystemRunContext,
} from "../systems.types";

export function createSteeringSystem(): DaemonSystem {
  return {
    name: "steering",

    onRunPrepare(runContext: SystemRunContext): void {
      const { run, sink, systemData, actions } = runContext;

      systemData.set("steeringMailbox", []);

      actions.register("steer", run.id, (text): boolean => {
        const mailbox = systemData.get("steeringMailbox");
        if (!mailbox) return false;

        mailbox.push(text);

        sink.broadcast(run.id, {
          type: "steer_queued",
          runId: run.id,
          text,
          ts: new Date().toISOString(),
        });

        return true;
      });
    },

    onStrategyLoaded(strategyContext: StrategyLoadedContext): void {
      const { strategy, systemData } = strategyContext;

      for (const agent of Object.values(strategy.agents)) {
        if (!agent.appendHook) continue;

        agent.appendHook("alterCallMessage", (message: string): string => {
          const mailbox = systemData.get("steeringMailbox");
          if (!mailbox || mailbox.length === 0) return message;

          const steeringBlock = mailbox
            .map((text) => `<user_steering>\n${text}\n</user_steering>`)
            .join("\n\n");

          mailbox.length = 0;

          return message.length > 0
            ? `${message}\n\n${steeringBlock}`
            : steeringBlock;
        });
      }
    },
  };
}
