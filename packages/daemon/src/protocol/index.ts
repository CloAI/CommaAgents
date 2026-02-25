// Protocol barrel — re-exports all message types, unions, and shared schemas.

// Client → Daemon messages
export {
  ClientMessage,
  ListFlowsMessage,
  PingMessage,
  ProvideAuthMessage,
  parseClientMessage,
  StartFlowMessage,
  StopFlowMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  UserInputMessage,
} from "./client";
// Daemon → Client messages
export {
  AgentOutputMessage,
  AgentStreamingMessage,
  DaemonMessage,
  ErrorMessage,
  FlowCompletedMessage,
  FlowErrorMessage,
  FlowListMessage,
  FlowStartedMessage,
  PongMessage,
  parseDaemonMessage,
  RequestAuthMessage,
  RequestInputMessage,
  StepCompletedMessage,
  StepStartedMessage,
} from "./daemon";
export type {
  AgentCallResultWire,
  AgentStreamEventWire,
  ApiCredential,
  Credential,
  CustomCredential,
  ErrorInfo,
  OAuthCredential,
  RunSummary,
  Usage,
} from "./shared";
// Shared primitives
export {
  AgentCallResultSchema,
  AgentStreamEventSchema,
  ApiCredentialSchema,
  ClientBase,
  CredentialSchema,
  CustomCredentialSchema,
  DaemonBase,
  ErrorInfoSchema,
  OAuthCredentialSchema,
  RunSummarySchema,
  UsageSchema,
} from "./shared";
