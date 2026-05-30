// Requests module barrel — single import point for the daemon's request
// handling layer. Exports all schemas, message types, unions, handlers,
// and the dispatcher.

// Dispatcher
export type { CreateDispatcherOptions } from "./dispatcher";
export { createDispatcher } from "./dispatcher";
export type {
  HandlerContext,
  MessageDispatcher,
  RequestResponseMap,
} from "./dispatcher.types";
// Message unions + parse helpers
export {
  ClientMessage,
  DaemonMessage,
  parseClientMessage,
  parseDaemonMessage,
} from "./messages";
export {
  GetAvailableModelsMessage,
  handleGetAvailableModels,
} from "./requests/get-available-models";
export {
  GetRunMessage,
  handleGetRun,
} from "./requests/get-run";
export {
  handleListRuns,
  ListRunsMessage,
} from "./requests/list-runs";
// Request handlers + client message schemas
export {
  handleListStrategies,
  ListStrategiesMessage,
} from "./requests/list-strategies";
export {
  handlePermissionDecision,
  PermissionDecisionMessage,
} from "./requests/permission-decision";
export { handlePing, PingMessage } from "./requests/ping";
export {
  handleResumeRun,
  ResumeRunMessage,
} from "./requests/resume-run";
export {
  handleStartStrategy,
  StartStrategyMessage,
} from "./requests/start-strategy";
export {
  handleStopStrategy,
  StopStrategyMessage,
} from "./requests/stop-strategy";
export { handleSubscribe, SubscribeMessage } from "./requests/subscribe";
export {
  handleTrashClear,
  TrashClearMessage,
} from "./requests/trash-clear";
export {
  handleTrashList,
  TrashListMessage,
} from "./requests/trash-list";
export {
  handleTrashRestore,
  TrashRestoreMessage,
} from "./requests/trash-restore";
export { handleUnsubscribe, UnsubscribeMessage } from "./requests/unsubscribe";
export {
  handleUpdatePolicy,
  UpdatePolicyMessage,
} from "./requests/update-policy";
export { handleUserInput, UserInputMessage } from "./requests/user-input";
// Daemon → Client response/event schemas
export { AgentOutputMessage } from "./responses/agent-output";
export { AgentStreamingMessage } from "./responses/agent-streaming";
export type { AgentStreamEventWire } from "./responses/agent-streaming/agent-streaming.schema";
export { AgentStreamEventSchema } from "./responses/agent-streaming/agent-streaming.schema";
export type { AvailableModelWire } from "./responses/available-models";
export { AvailableModelsMessage } from "./responses/available-models";
export { ErrorMessage } from "./responses/error";
export { PolicyUpdatedMessage } from "./responses/policy-updated";
export { PongMessage } from "./responses/pong";
export { RequestInputMessage } from "./responses/request-input";
export { RequestPermissionMessage } from "./responses/request-permission";
export type { RunOverviewWire } from "./responses/run-list";
export {
  RunListMessage,
  RunOverviewSchema,
} from "./responses/run-list";
export type { RunLoadedMessage } from "./responses/run-loaded";
export { RunLoadedMessage as RunLoadedMessageSchema } from "./responses/run-loaded/run-loaded.schema";
// Colocated schemas re-exported for public API
export type { AgentCallResultWire, Usage } from "./responses/shared";
export { AgentCallResultSchema, UsageSchema } from "./responses/shared";
export { StepCompletedMessage } from "./responses/step-completed";
export { StepStartedMessage } from "./responses/step-started";
export { StrategyCompletedMessage } from "./responses/strategy-completed";
export { StrategyErrorMessage } from "./responses/strategy-error";
export type { ErrorInfo } from "./responses/strategy-error/strategy-error.schema";
export { ErrorInfoSchema } from "./responses/strategy-error/strategy-error.schema";
export { StrategyListMessage } from "./responses/strategy-list";
export type { RunSummary } from "./responses/strategy-list/strategy-list.schema";
export { RunSummarySchema } from "./responses/strategy-list/strategy-list.schema";
export { StrategyStartedMessage } from "./responses/strategy-started";
// Shared base envelopes
export { ClientBase, DaemonBase } from "./shared";
