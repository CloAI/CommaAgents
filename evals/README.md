# Evals

Public benchmarks run against the local checkout through [Harbor](https://docs.harborframework.com/).
The adapter in `harbor/comma_agent.py` uploads this repository into each task container and
runs `comma run` headlessly, so strategy and prompt changes are measured before release.

## Headless runs

`comma run` executes one strategy without the TUI. It is also how the adapter drives each trial.

```sh
bun run cli run -s Build -i "Fix the failing parser test" --approve allow
bun run cli run -s Plan -i "Add retry support to webfetch" --then Build --approve allow --json
```

| Option | Effect |
|---|---|
| `--max-user-turns` | User turns accepted before the run stops (default 1). Later turns are answered automatically. |
| `--approve allow\|deny` | Answer for every sandbox permission request (default `deny`). |
| `--then <strategy...>` | Switch to each strategy in order, in the same conversation, after the previous one finishes. |
| `--then-input` | Message sent to each `--then` strategy. |
| `--json` | Print the run ID, outcome, every agent message, and token usage. |

Tool questions (`ask_question`) are answered with "proceed with your recommended option".

## Tiers

| Tier | When | Build | Plan | Chat research |
|---|---|---|---|---|
| Smoke (`scripts/smoke.sh`) | Every strategy change | 20 Aider Polyglot, 10 Terminal-Bench 4.0, 10 SWE-rebench | Same 10 SWE-rebench, Plan then Build | 50 SimpleQA Verified, 30 FRAMES, 20 BrowseComp-Plus |
| Mid | Weekly or before a release | Full Terminal-Bench 4.0, one SWE-rebench month, full Polyglot, mini-SWE-agent baseline | No plan vs Plan vs reference plan | 150 BrowseComp-Plus, GAIA validation L1–2 |
| Full | Manual | SWE-bench Pro sample, Multi-SWE-bench TS/JS | Ablation on Pro | Full BrowseComp-Plus, DeepResearch Bench |

Report SWE-rebench and other dated splits first; treat SWE-bench Verified and GAIA as relative
comparisons only, since both are contaminated. Compare against mini-SWE-agent on the same model:
a harness that cannot beat it adds cost without adding value.

## Running the tiers

```sh
pip install harbor
MODEL=openrouter/google/gemini-3.5-flash KEY_ENV=OPENROUTER_API_KEY evals/scripts/smoke.sh
SWE_REBENCH_MONTH=swe-rebench-07-2026 MODEL=... KEY_ENV=... evals/scripts/mid.sh
```

The plan ablation compares `build-swe` (Build alone) with `plan-then-build` (Plan, then a strategy
switch to Build in the same conversation) on the same tasks. A reference-plan arm needs plans
written for each task and is not scripted yet.

The scripts cover Build and Plan. Chat research slices are added once the research subagent
and `web_search` tool exist.

Results are written under `evals/jobs/<timestamp>/`. Each trial's `comma run --json` output is
saved in the container at `/logs/agent/comma-run.json`.
