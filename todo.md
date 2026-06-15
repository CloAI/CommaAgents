# Abort Refactor — Deferred Work

After moving abort/cancellation from config-time to per-call `.abort()` (Wave 3),
the following gaps remain and need to be addressed in a future wave.

---

## 1. Flow-level abort threading

**Problem**: Flows (`sequential-flow`, `cycle-flow`, `broadcast-flow`) previously
received `config.abort` and used it to:

- Guard before each step (`abort?.aborted` check in `FlowContext.runStep()`)
- Terminate infinite cycle loops (`config.abort?.aborted` in `cycle-flow.ts`)

Now that `abort` is removed from `FlowConfig`, flows have no way to cancel
in-flight agent calls or stop iteration early.

**Decision needed**: How should a flow cancel its child agents? Options include:

- A per-flow `AbortController` created at flow execution time, with `.abort()`
  on the returned flow result
- An `AbortSignal` parameter on the flow's `call()` method
- A flow-level `.stop()` method that aborts all in-flight agent calls

This requires examining how flows call `agent.call()` and whether the returned
`AbortablePromise` should be tracked and aborted on flow cancellation.

---

## 2. Daemon `stopRun` no longer cancels agent calls

**Problem**: `executor.ts` `stopRun()` calls `run.abortController.abort()`, which
previously propagated through `LoadStrategyOptions.abort` → `AgentConfig.abort` →
`generateText()`/`streamText()` to cancel in-flight LLM requests.

Now that the agent's abort signal is per-call (internal to each `call()`/`stream()`
invocation), `run.abortController.abort()` only cancels:

- The input bridge (pending `requestInput` calls)

It does **not** cancel in-flight agent LLM calls.

**Fix needed**: The daemon's `stopRun` needs a way to abort all in-flight agent
calls for a run. This depends on the flow-level abort threading decision above.

---

## 3. UserAgent input collector signal

**Problem**: `createUserAgent` previously passed `config.abort` as the `signal`
field on `InputRequest` when calling the input collector:

```ts
signal: config.abort  // was passed to InputRequest
```

Now that `config.abort` is removed from `UserAgentConfig`, the `InputRequest.signal`
is never set (always `undefined`), meaning:

- The `defaultInputCollector` (stdin-based) cannot be externally cancelled
- Custom input collectors receive no signal for cooperative cancellation

**Note**: The daemon input system has its own run abort mechanism, which is
separate and unaffected. This gap primarily affects direct `createUserAgent`
usage outside the daemon.

**Fix needed**: Either:

- Accept an `AbortSignal` parameter on the user agent's `call()` method
- Create a per-call controller in user agent's `call()` (like the LLM agent does)
  and pass it to the input collector
- Expose `.abort()` on the user agent's returned `AbortablePromise` and thread
  the signal to the input collector
