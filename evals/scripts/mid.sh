#!/usr/bin/env bash
# Mid tier: full Terminal-Bench 4.0, one SWE-rebench month, full Aider Polyglot, a mini-SWE-agent
# baseline on the same model, and the plan ablation (Build alone vs Plan then Build).
#
#   MODEL=openrouter/google/gemini-3.5-flash KEY_ENV=OPENROUTER_API_KEY evals/scripts/mid.sh
#
# Estimated cost with a mid-tier model: $20–100. Dataset identifiers come from `harbor datasets list`.
set -euo pipefail

MODEL="${MODEL:?set MODEL to provider/model}"
KEY_ENV="${KEY_ENV:?set KEY_ENV to the provider key variable name, e.g. OPENROUTER_API_KEY}"
JOBS_DIR="${JOBS_DIR:-evals/jobs/mid-$(date +%Y%m%d-%H%M%S)}"
TERMINAL_BENCH="${TERMINAL_BENCH:-terminal-bench/terminal-bench@4.0.0}"
POLYGLOT="${POLYGLOT:-aider-polyglot}"
SWE_REBENCH_MONTH="${SWE_REBENCH_MONTH:?set SWE_REBENCH_MONTH to a monthly split, e.g. swe-rebench-07-2026}"
CONCURRENCY="${CONCURRENCY:-8}"

run_dataset() {
  local dataset="$1" label="$2"; shift 2
  harbor run -d "$dataset" -n "$CONCURRENCY" -e "${HARBOR_ENV:-docker}" -m "$MODEL" \
    --ae "$KEY_ENV=${!KEY_ENV}" -o "$JOBS_DIR/$label" "$@"
}

comma() { run_dataset "$1" "$2" -a evals.harbor.comma_agent:CommaAgent "${@:3}"; }

comma "$TERMINAL_BENCH" build-terminal --ak strategy=Build
comma "$POLYGLOT" build-polyglot --ak strategy=Build
comma "$SWE_REBENCH_MONTH" build-swe --ak strategy=Build
comma "$SWE_REBENCH_MONTH" plan-then-build --ak strategy=Plan --ak then=Build

# Baseline: the same SWE-rebench month with mini-SWE-agent. Confirm Harbor's agent name with
# `harbor agents list` and override BASELINE_AGENT if it differs.
run_dataset "$SWE_REBENCH_MONTH" baseline-mini-swe-agent -a "${BASELINE_AGENT:-mini-swe-agent}"

echo "Results in $JOBS_DIR. Compare resolve rates and token use between build-swe, plan-then-build, and baseline-mini-swe-agent."
