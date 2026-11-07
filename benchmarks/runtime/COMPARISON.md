# Bun versus Node 26 migration experiment

These measurements were captured in two isolated worktrees starting from snapshot 4a41089, including the original checkout's uncommitted work. Migration branch: migration/node26-uws. See [MIGRATION.md](./MIGRATION.md) for the current integration status.

## Measured comparison

Values are medians of 5 trials per runtime; latency percentiles are medians of the per-trial percentiles. The percentage is Node relative to Bun. Lower is better for time/memory; higher is better for throughput.

| Workload | Bun 1.3.10 | Node v26.13.0 + uWS | Change |
| --- | ---: | ---: | ---: |
| Core: 2,000 agent/template calls (ms) | 60.42 | 59.97 | -0.8% |
| Cold module/listener startup (ms) | 469.13 | 449.75 | -4.1% |
| RSS after 1-second idle (MiB) | 241.77 | 231.75 | -4.1% |
| Commands, 1 connections (requests/s) | 5674.71 | 6334.11 | +11.6% |
| Commands, 1 connections, p95 (ms) | 0.31 | 0.31 | -1.6% |
| Commands, 10 connections (requests/s) | 56309.08 | 55244.17 | -1.9% |
| Commands, 10 connections, p95 (ms) | 0.26 | 0.29 | +9.8% |
| Commands, 100 connections (requests/s) | 68627.06 | 69747.82 | +1.6% |
| Commands, 100 connections, p95 (ms) | 2.33 | 2.44 | +4.7% |
| Burst stream, 1 clients, 128 B (messages/s) | 91590.12 | 84225.30 | -8.0% |
| Burst stream, 10 clients, 128 B (messages/s) | 146349.05 | 130026.05 | -11.2% |
| Burst stream, 100 clients, 128 B (messages/s) | 186639.27 | 139996.06 | -25.0% |
| Burst stream, 1 clients, 65536 B (messages/s) | 17395.21 | 14075.26 | -19.1% |
| Paced token delivery, p95 (ms) | 3.36 | 0.46 | -86.4% |
| 30 reconnect/subscription cycles (ms) | 36.06 | 34.26 | -5.0% |
| Listener shutdown with active subscription (ms) | 0.90 | 0.83 | -8.2% |

The paused-reader workload publishes 62.5 MiB of payload. Bun removed the subscriber in 0/5 trials; Node removed it in 5/5. Node has an explicit bounded-buffer disconnect policy. This behavior difference is approved and is covered by a test asserting code 1013 and subscription cleanup.

## Execution and package compatibility

The deterministic daemon run/persistence workload prepares, streams, and persists 20 real kernel runs. Node completes it in a median 1050.82 ms. The frozen Bun published build fails this workload, so no execution-speed ratio is reported for it. Its separate root and strategy bundles hold different registries: a model/tool registered through the root entrypoint is unavailable through the strategy entrypoint. A separate baseline registration probe confirms this. The Node build shares these modules across entrypoints.

The core microbenchmark uses deterministic execute overrides and prompt templates; it does not measure live model latency or external tools. Burst streaming measures synchronous fanout pressure. Paced streaming separately measures 100 deliveries at a nominal 5 ms interval. It is not a model-token generation benchmark.

## Reproduce

Build core and daemon in each worktree, then select Node 26 for the load generator and run these commands sequentially:

```bash
node benchmarks/runtime/compare.mjs /path/to/bun /path/to/bun-baseline benchmarks/runtime/results/bun.json 5
node benchmarks/runtime/compare.mjs /path/to/node26 /path/to/node-worktree benchmarks/runtime/results/node.json 5
node benchmarks/runtime/summarize.mjs
```

Runtime paths, versions, machine details, source HEADs, dirty status, worker hash, and hashes covering all JavaScript build chunks are recorded in the JSON results. The load generator always runs in a separate Node 26 process. These are local loopback results on Apple M1, darwin/arm64; they do not establish performance on other machines, operating systems, or Electron.
