// Requests module barrel — single import point for the daemon's request
// handling layer. Exports all schemas, message types, unions, handlers,
// and the dispatcher.

// Dispatcher
export type { CreateDispatcherOptions } from "./dispatcher";
export { createDispatcher } from "./dispatcher";
export type { HandlerContext, MessageDispatcher, RequestResponseMap } from "./dispatcher.types";
// Message unions + parse helpers
export { ClientMessage, DaemonMessage, parseClientMessage, parseDaemonMessage } from "./messages";

// Request handlers + client message schemas
export { handleListStrategies, ListStrategiesMessage } from "./requests/list-strategies";
export { handlePing, PingMessage } from "./requests/ping";
export { handleStartStrategy, StartStrategyMessage } from "./requests/start-strategy";
export { handleStopStrategy, StopStrategyMessage } from "./requests/stop-strategy";
export { handleSubscribe, SubscribeMessage } from "./requests/subscribe";
export { handleUnsubscribe, UnsubscribeMessage } from "./requests/unsubscribe";
export { handleUserInput, UserInputMessage } from "./requests/user-input";
// Daemon → Client response/event schemas
export { AgentOutputMessage } from "./responses/agent-output";
export { AgentStreamingMessage } from "./responses/agent-streaming";
export type { AgentStreamEventWire } from "./responses/agent-streaming/agent-streaming.schema";
export { AgentStreamEventSchema } from "./responses/agent-streaming/agent-streaming.schema";
export { ErrorMessage } from "./responses/error";
export { StrategyCompletedMessage } from "./responses/strategy-completed";
export { StrategyErrorMessage } from "./responses/strategy-error";
export type { ErrorInfo } from "./responses/strategy-error/strategy-error.schema";
export { ErrorInfoSchema } from "./responses/strategy-error/strategy-error.schema";
export { StrategyListMessage } from "./responses/strategy-list";
export type { RunSummary } from "./responses/strategy-list/strategy-list.schema";
export { RunSummarySchema } from "./responses/strategy-list/strategy-list.schema";
export { StrategyStartedMessage } from "./responses/strategy-started";
export { PongMessage } from "./responses/pong";
export { RequestInputMessage } from "./responses/request-input";
// Colocated schemas re-exported for public API
export type { AgentCallResultWire, Usage } from "./responses/shared";
export { AgentCallResultSchema, UsageSchema } from "./responses/shared";
export { StepCompletedMessage } from "./responses/step-completed";
export { StepStartedMessage } from "./responses/step-started";
// Shared base envelopes
export { ClientBase, DaemonBase } from "./shared";
