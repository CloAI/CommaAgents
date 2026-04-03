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
export { handleListFlows, ListFlowsMessage } from "./requests/list-flows";
export { handlePing, PingMessage } from "./requests/ping";
export { handleStartFlow, StartFlowMessage } from "./requests/start-flow";
export { handleStopFlow, StopFlowMessage } from "./requests/stop-flow";
export { handleSubscribe, SubscribeMessage } from "./requests/subscribe";
export { handleUnsubscribe, UnsubscribeMessage } from "./requests/unsubscribe";
export { handleUserInput, UserInputMessage } from "./requests/user-input";
// Daemon → Client response/event schemas
export { AgentOutputMessage } from "./responses/agent-output";
export { AgentStreamingMessage } from "./responses/agent-streaming";
export type { AgentStreamEventWire } from "./responses/agent-streaming/agent-streaming.schema";
export { AgentStreamEventSchema } from "./responses/agent-streaming/agent-streaming.schema";
export { ErrorMessage } from "./responses/error";
export { FlowCompletedMessage } from "./responses/flow-completed";
export { FlowErrorMessage } from "./responses/flow-error";
export type { ErrorInfo } from "./responses/flow-error/flow-error.schema";
export { ErrorInfoSchema } from "./responses/flow-error/flow-error.schema";
export { FlowListMessage } from "./responses/flow-list";
export type { RunSummary } from "./responses/flow-list/flow-list.schema";
export { RunSummarySchema } from "./responses/flow-list/flow-list.schema";
export { FlowStartedMessage } from "./responses/flow-started";
export { PongMessage } from "./responses/pong";
export { RequestInputMessage } from "./responses/request-input";
// Colocated schemas re-exported for public API
export type { AgentCallResultWire, Usage } from "./responses/shared";
export { AgentCallResultSchema, UsageSchema } from "./responses/shared";
export { StepCompletedMessage } from "./responses/step-completed";
export { StepStartedMessage } from "./responses/step-started";
// Shared base envelopes
export { ClientBase, DaemonBase } from "./shared";
