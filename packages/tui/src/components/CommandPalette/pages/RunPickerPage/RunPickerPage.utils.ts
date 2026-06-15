import type { ChatRun, RunOverview } from "../../../../hooks/useChat";
import type { RunItem } from "./RunPickerPage.types";

export function chatRunHaystack(s: ChatRun): string {
  return [s.label, s.strategyName ?? "", s.strategyPath ?? "", s.id].join(" ");
}

export function persistedHaystack(s: RunOverview): string {
  return [s.strategyName, s.cwd, s.runId].join(" ");
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatIsoDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function itemHaystack(item: RunItem): string {
  return item.kind === "local"
    ? chatRunHaystack(item.chatRun)
    : persistedHaystack(item.meta);
}
