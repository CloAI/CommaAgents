export interface TodoItem {
  readonly id: string;
  readonly content: string;
  status: "pending" | "completed";
  readonly createdAt: string;
  completedAt?: string;
}
