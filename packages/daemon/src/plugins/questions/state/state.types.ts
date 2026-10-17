import type { PluginNotifications } from "../../../daemon-plugin";
import type { RunsPlugin, StrategyLoaderInputs } from "../../runs";
import type { QuestionRunResources } from "../run-resources/run-resources.types";
import type {
  QuestionRequested,
  QuestionsNotifications,
} from "../questions.notifications";

/** @internal Question callback accepted by the strategy loader. */
export type QuestionRequester = NonNullable<
  StrategyLoaderInputs["questionRequester"]
>;

/** @internal Request supplied by a tool to the loader's question callback. */
export type QuestionRequest = Parameters<QuestionRequester>[0];

/** @internal Pending response and its cancellation resources. */
export interface PendingQuestion {
  readonly runResources: QuestionRunResources;
  readonly request: QuestionRequested;
  readonly resolve: (response: string) => void;
  readonly reject: (reason: unknown) => void;
  readonly detachAbort: () => void;
}

/** @internal State owned exclusively by the questions plugin. */
export interface QuestionsContext {
  readonly runs: Pick<RunsPlugin, "getRunLineage">;
  readonly notifications: PluginNotifications<QuestionsNotifications>;
  readonly runResources: Map<string, QuestionRunResources>;
  readonly pending: Map<string, PendingQuestion>;
  disposed: boolean;
}
