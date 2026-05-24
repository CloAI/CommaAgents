export interface ListSkillsEntry {
  readonly name: string;
  readonly description: string;
  readonly origin: "global" | "project";
  readonly sourcePath: string;
}

export interface ListSkillsData {
  readonly skills: readonly ListSkillsEntry[];
  readonly count: number;
}
