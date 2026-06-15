import type {
  ChatRun,
  RunOverview,
} from "../../../../hooks/useChat/useChat.types";

export type RunItem =
  | { readonly kind: "local"; readonly chatRun: ChatRun }
  | { readonly kind: "persisted"; readonly meta: RunOverview };
