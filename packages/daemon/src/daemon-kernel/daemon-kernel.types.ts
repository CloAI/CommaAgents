import type { CreateRunsPluginOptions, RunsPlugin } from "../plugins/runs";
import type { SandboxPlugin } from "../plugins/sandbox";
import type { QuestionsPlugin } from "../plugins/questions";
import type { SkillsPlugin } from "../plugins/skills";
import type { McpPlugin } from "../plugins/mcp";
import type { StatusPlugin } from "../plugins/status";
import type { Plugin } from "../daemon-plugin";
import type { LspPlugin } from "../plugins/lsp";

/** Named services owned by the daemon; feature plugins receive these explicitly. */
export interface DaemonPlugins extends Readonly<Record<string, Plugin>> {
  /** Daemon lifecycle state, independent of network listeners. */
  readonly status: StatusPlugin;
  /** Service for all strategy run operations. */
  readonly runs: RunsPlugin;
  /** Sandboxes and permission decisions for root and child runs. */
  readonly sandbox: SandboxPlugin;
  /** Tool questions and user responses for root and child runs. */
  readonly questions: QuestionsPlugin;
  /** Skills loaded for each prepared root or child execution. */
  readonly skills: SkillsPlugin;
  /** MCP tools, connections, and server selections for root and child executions. */
  readonly mcp: McpPlugin;
  /** Lazy language queries backed by one subprocess per working directory. */
  readonly lsp: LspPlugin;
}

/** Configuration for constructing a daemon without a server. */
export interface CreateDaemonKernelOptions {
  /** Run storage and feature dependencies. */
  readonly runs: CreateRunsPluginOptions;
  /** Models for `@role` references at startup. @default {} */
  readonly modelRoles?: Readonly<Record<string, string>>;
  /** Saves roles changed through `core.modelRoles.set`. @default roles last only until restart */
  readonly persistModelRoles?: (
    modelRoles: Readonly<Record<string, string>>,
  ) => void;
  /** Manually initialize feature plugins and their dependencies at startup. */
  readonly initialize?: (plugins: DaemonPlugins) => Promise<void> | void;
}

/** Daemon-owned plugins and their resource cleanup. */
export interface DaemonKernel {
  /** Typed feature services available to the daemon and each other. */
  readonly plugins: DaemonPlugins;
  /** Stop active work and release plugin resources. */
  dispose(): Promise<void>;
}
