#!/usr/bin/env bash
# Smoke tier: small, fixed task slices per harness. Run from the repository root.
# Requires: harbor (pip install harbor), Docker, and a provider key exported in the shell.
#
#   MODEL=openrouter/google/gemini-3.5-flash KEY_ENV=OPENROUTER_API_KEY evals/scripts/smoke.sh
#
# Dataset identifiers come from `harbor datasets list`; override them when the registry moves.
set -euo pipefail

MODEL="${MODEL:?set MODEL to provider/model}"
KEY_ENV="${KEY_ENV:?set KEY_ENV to the provider key variable name, e.g. OPENROUTER_API_KEY}"
JOBS_DIR="${JOBS_DIR:-evals/jobs/$(date +%Y%m%d-%H%M%S)}"
TERMINAL_BENCH="${TERMINAL_BENCH:-terminal-bench/terminal-bench@4.0.0}"
POLYGLOT="${POLYGLOT:-aider-polyglot}"
SWE_REBENCH="${SWE_REBENCH:-swe-rebench}"
CONCURRENCY="${CONCURRENCY:-4}"

run_slice() {
  local dataset="$1" tasks="$2" label="$3"; shift 3
  harbor run -d "$dataset" -l "$tasks" -n "$CONCURRENCY" -e docker \
    -a evals.harbor.comma_agent:CommaAgent -m "$MODEL" \
    --ae "$KEY_ENV=${!KEY_ENV}" -o "$JOBS_DIR/$label" "$@"
}

# Build: edit-format sensitivity, terminal work, real repository issues.
run_slice "$POLYGLOT" 20 build-polyglot --ak strategy=Build
run_slice "$TERMINAL_BENCH" 10 build-terminal --ak strategy=Build
run_slice "$SWE_REBENCH" 10 build-swe --ak strategy=Build

# Plan ablation: the same issues, planned first and then built in one conversation.
run_slice "$SWE_REBENCH" 10 plan-then-build --ak strategy=Plan --ak then=Build

echo "Results in $JOBS_DIR"
