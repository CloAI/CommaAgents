import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("./results/", import.meta.url));
const bun = JSON.parse(await readFile(`${directory}bun.json`, "utf8"));
const node = JSON.parse(await readFile(`${directory}node.json`, "utf8"));
const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};
const select = (data, workload, filter = () => true) =>
  data.results.filter((row) => row.workload === workload && filter(row));
const rows = [];
function compare(label, workload, extract, filter) {
  const baseline = median(select(bun, workload, filter).map(extract));
  const migrated = median(select(node, workload, filter).map(extract));
  const change = (migrated / baseline - 1) * 100;
  rows.push(
    `| ${label} | ${baseline.toFixed(2)} | ${migrated.toFixed(2)} | ${change >= 0 ? "+" : ""}${change.toFixed(1)}% |`,
  );
}
compare(
  "Core: 2,000 agent/template calls (ms)",
  "core-agent-and-template",
  (row) => row.durationMs,
);
compare(
  "Cold module/listener startup (ms)",
  "startup-idle",
  (row) => row.startupMs,
);
compare(
  "RSS after 1-second idle (MiB)",
  "startup-idle",
  (row) => row.idle.memory.rss / 1048576,
);
for (const connections of [1, 10, 100]) {
  compare(
    `Commands, ${connections} connections (requests/s)`,
    "command-roundtrip",
    (row) => row.requestsPerSecond,
    (row) => row.connections === connections,
  );
  compare(
    `Commands, ${connections} connections, p95 (ms)`,
    "command-roundtrip",
    (row) => row.latencyMs.p95,
    (row) => row.connections === connections,
  );
}
for (const [connections, size] of [
  [1, 128],
  [10, 128],
  [100, 128],
  [1, 65536],
]) {
  compare(
    `Burst stream, ${connections} clients, ${size} B (messages/s)`,
    "burst-stream-fanout",
    (row) => row.messagesPerSecond,
    (row) => row.connections === connections && row.size === size,
  );
}
compare(
  "Paced token delivery, p95 (ms)",
  "paced-token-delivery",
  (row) => row.latencyMs.p95,
);
compare(
  "30 reconnect/subscription cycles (ms)",
  "reconnect-subscribe",
  (row) => row.durationMs,
);
compare(
  "Listener shutdown with active subscription (ms)",
  "shutdown-active-subscription",
  (row) => row.shutdownMs,
);
const lifecycle = select(node, "daemon-run-persistence");
const commands =
  "```bash\nnode benchmarks/runtime/compare.mjs /path/to/bun /path/to/bun-baseline benchmarks/runtime/results/bun.json 5\nnode benchmarks/runtime/compare.mjs /path/to/node26 /path/to/node-worktree benchmarks/runtime/results/node.json 5\nnode benchmarks/runtime/summarize.mjs\n```";
const report = `# Bun versus Node 26 migration experiment

These measurements were captured in two isolated worktrees starting from snapshot 4a41089, including the original checkout's uncommitted work. Migration branch: migration/node26-uws. See [MIGRATION.md](./MIGRATION.md) for the current integration status.

## Measured comparison

Values are medians of ${bun.trials} trials per runtime; latency percentiles are medians of the per-trial percentiles. The percentage is Node relative to Bun. Lower is better for time/memory; higher is better for throughput.

| Workload | Bun ${bun.runtimeVersion} | Node ${node.runtimeVersion} + uWS | Change |
| --- | ---: | ---: | ---: |
${rows.join("\n")}

The paused-reader workload publishes 62.5 MiB of payload. Bun removed the subscriber in ${select(bun, "slow-reader").filter((row) => row.disconnected).length}/${bun.trials} trials; Node removed it in ${select(node, "slow-reader").filter((row) => row.disconnected).length}/${node.trials}. Node has an explicit bounded-buffer disconnect policy. This behavior difference is approved and is covered by a test asserting code 1013 and subscription cleanup.

## Execution and package compatibility

The deterministic daemon run/persistence workload prepares, streams, and persists 20 real kernel runs. Node completes it in a median ${median(lifecycle.map((row) => row.durationMs)).toFixed(2)} ms. The frozen Bun published build fails this workload, so no execution-speed ratio is reported for it. Its separate root and strategy bundles hold different registries: a model/tool registered through the root entrypoint is unavailable through the strategy entrypoint. A separate baseline registration probe confirms this. The Node build shares these modules across entrypoints.

The core microbenchmark uses deterministic execute overrides and prompt templates; it does not measure live model latency or external tools. Burst streaming measures synchronous fanout pressure. Paced streaming separately measures 100 deliveries at a nominal 5 ms interval. It is not a model-token generation benchmark.

## Reproduce

Build core and daemon in each worktree, then select Node 26 for the load generator and run these commands sequentially:

${commands}

Runtime paths, versions, machine details, source HEADs, dirty status, worker hash, and hashes covering all JavaScript build chunks are recorded in the JSON results. The load generator always runs in a separate Node 26 process. These are local loopback results on ${node.cpu}, ${node.platform}/${node.arch}; they do not establish performance on other machines, operating systems, or Electron.
`;
await writeFile(
  fileURLToPath(new URL("./COMPARISON.md", import.meta.url)),
  report,
);
console.log("benchmarks/runtime/COMPARISON.md");
