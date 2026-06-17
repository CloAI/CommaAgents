// createExperimentStore — file-backed persistence for experiments.
//
// Layout (rooted at `rootDir`, default `./.rlprompter`):
//   <experiment-id>/experiment.json   metadata + iteration index
//   <experiment-id>/<iteration-id>.jsonl   one iteration's timeline events
//
// Mirrors the daemon RunStore's JSONL convention so iteration timelines are
// interchangeable with core timeline projections.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TimelineEvent } from "@comma-agents/core";
import type {
  AppendIterationInput,
  CreateExperimentInput,
  CreateExperimentStoreOptions,
  Experiment,
  ExperimentOverview,
  ExperimentStore,
  Iteration,
  IterationFeedback,
  IterationSummary,
} from "./experiment.types";

const DEFAULT_ROOT = ".rlprompter";
const META_FILE = "experiment.json";

export function createExperimentStore(
  options: CreateExperimentStoreOptions = {},
): ExperimentStore {
  const rootDir = options.rootDir ?? DEFAULT_ROOT;

  const experimentDir = (id: string): string => join(rootDir, id);
  const metaPath = (id: string): string => join(experimentDir(id), META_FILE);
  const iterationPath = (experimentId: string, iterationId: string): string =>
    join(experimentDir(experimentId), `${iterationId}.jsonl`);

  async function readMeta(id: string): Promise<Experiment> {
    const raw = await readFile(metaPath(id), "utf-8");
    return JSON.parse(raw) as Experiment;
  }

  async function writeMeta(experiment: Experiment): Promise<void> {
    await mkdir(experimentDir(experiment.id), { recursive: true });
    await writeFile(
      metaPath(experiment.id),
      `${JSON.stringify(experiment, null, 2)}\n`,
      "utf-8",
    );
  }

  return {
    async create(input: CreateExperimentInput): Promise<Experiment> {
      const experiment: Experiment = {
        id: randomUUID(),
        name: input.name,
        createdAt: new Date().toISOString(),
        strategyPath: input.strategyPath,
        ...(input.seedDir !== undefined ? { seedDir: input.seedDir } : {}),
        ...(input.modelOverride !== undefined
          ? { modelOverride: input.modelOverride }
          : {}),
        iterations: [],
      };
      await writeMeta(experiment);
      return experiment;
    },

    load(experimentId: string): Promise<Experiment> {
      return readMeta(experimentId);
    },

    async list(): Promise<readonly ExperimentOverview[]> {
      if (!existsSync(rootDir)) return [];
      const entries = await readdir(rootDir, { withFileTypes: true });
      const overviews: ExperimentOverview[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!existsSync(metaPath(entry.name))) continue;
        try {
          const meta = await readMeta(entry.name);
          overviews.push({
            id: meta.id,
            name: meta.name,
            createdAt: meta.createdAt,
            strategyPath: meta.strategyPath,
            iterationCount: meta.iterations.length,
          });
        } catch {
          // Skip unreadable/corrupt experiment dirs.
        }
      }
      return overviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async appendIteration(
      experimentId: string,
      input: AppendIterationInput,
    ): Promise<Iteration> {
      const experiment = await readMeta(experimentId);
      const iterationId = randomUUID();

      // Persist the full timeline as JSONL.
      const lines = input.result.events
        .map((event) => JSON.stringify(event))
        .join("\n");
      await writeFile(
        iterationPath(experimentId, iterationId),
        lines.length > 0 ? `${lines}\n` : "",
        "utf-8",
      );

      const iteration: Iteration = {
        id: iterationId,
        index: experiment.iterations.length + 1,
        createdAt: new Date().toISOString(),
        input: input.input,
        overrides: input.overrides,
        summary: summarize(input.result),
        ...(input.feedback !== undefined ? { feedback: input.feedback } : {}),
      };

      await writeMeta({
        ...experiment,
        iterations: [...experiment.iterations, iteration],
      });
      return iteration;
    },

    async getIterationEvents(
      experimentId: string,
      iterationId: string,
    ): Promise<readonly TimelineEvent[]> {
      const path = iterationPath(experimentId, iterationId);
      if (!existsSync(path)) return [];
      const raw = await readFile(path, "utf-8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as TimelineEvent);
    },

    async setIterationFeedback(
      experimentId: string,
      iterationId: string,
      feedback: IterationFeedback,
    ): Promise<Iteration> {
      const experiment = await readMeta(experimentId);
      let updated: Iteration | undefined;
      const iterations = experiment.iterations.map((iteration) => {
        if (iteration.id !== iterationId) return iteration;
        updated = { ...iteration, feedback };
        return updated;
      });
      if (!updated) {
        throw new Error(
          `Iteration "${iterationId}" not found in experiment "${experimentId}".`,
        );
      }
      await writeMeta({ ...experiment, iterations });
      return updated;
    },

    async delete(experimentId: string): Promise<boolean> {
      const dir = experimentDir(experimentId);
      if (!existsSync(dir)) return false;
      await rm(dir, { recursive: true, force: true });
      return true;
    },
  };
}

/** Derive a compact iteration summary from a run result. */
function summarize(result: AppendIterationInput["result"]): IterationSummary {
  const mutationCount = result.events.filter(
    (event) => event.type === "tool_mutation" && event.success,
  ).length;
  return {
    text: result.result.text,
    promptTokens: result.result.usage.promptTokens,
    completionTokens: result.result.usage.completionTokens,
    mutationCount,
    status: result.status,
  };
}
