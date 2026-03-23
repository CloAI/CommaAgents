---
name: ts-patterns
description: TypeScript coding conventions for this monorepo — file naming, module structure, factory patterns, type separation, commenting style, and test organization
---

## Overview

This skill defines the coding conventions for this Bun-based TypeScript monorepo. All new code and refactors must follow these patterns. The architecture is fully functional (no classes) with closure-based factories, strict `readonly` types, and a consistent file-per-concern module structure.

---

## File Naming and Module Structure

Every module follows the same file layout. All filenames use `kebab-case`. No PascalCase filenames.

| File | Purpose | Exported from barrel? |
|---|---|---|
| `index.ts` | Barrel — only `export` / `export type` re-exports | IS the barrel |
| `{domain}.ts` | Factory functions, closure state, lifecycle orchestration | Yes |
| `{domain}.types.ts` | All domain types — config interfaces, public contracts, result types, hook types | Yes |
| `{domain}.constants.ts` | Named constants and default value objects | No (internal) |
| `{domain}.utils.ts` | Pure stateless helpers used by the factory | No (internal) |
| `{domain}.test.ts` | Co-located unit tests | No |
| `test.utils.ts` | Shared test fixtures for the module | No |

### `{domain}.types.ts` holds ALL domain types

Every type that belongs to a domain lives in `{domain}.types.ts`. This includes:

- **Config interfaces** — what you pass into a factory
- **Public contracts** — what the system returns or what consumers implement
- **Result types** — return types from domain operations
- **Hook/callback types** — domain-specific lifecycle type definitions

A standalone `types.ts` (without a domain prefix) should be used **sparingly** — only for truly cross-cutting primitives shared across multiple unrelated domains (e.g., generic hook runner types). If the type is tightly related to a domain, it belongs in `{domain}.types.ts`.

Example:

```
scheduler/
  scheduler.ts              # createScheduler() factory
  scheduler.types.ts        # SchedulerConfig, Scheduler, SchedulerResult, SchedulerHooks
  scheduler.constants.ts    # DEFAULT_INTERVAL, DEFAULT_MAX_RETRIES
  scheduler.utils.ts        # pure helpers (buildSchedule, validateCron)
  scheduler.test.ts         # unit tests
  test.utils.ts             # shared test fixtures
  index.ts                  # barrel
```

### `{domain}.constants.ts` for named constants

Constants are extracted into their own file. This includes:

- Scalar defaults (`DEFAULT_MAX_STEPS`, `DEFAULT_SEPARATOR`)
- Default objects (`DEFAULTS: ResolvedOptions`)

```ts
// scheduler.constants.ts
export const DEFAULT_INTERVAL = 1000;
export const DEFAULT_MAX_RETRIES = 3;
```

Constants files are internal — never exported from barrels. The factory or utils file imports them.

### Subdomain folders

Specialized variants live in subdirectories with their own files following the same pattern:

```
parsers/
  json/json-parser.ts
  yaml/yaml-parser.ts
  xml/xml-parser.ts
```

---

## Index Barrel Pattern

### Rules

1. **Only `export` and `export type` statements** — no logic, no imports for side effects.
2. **Separate value exports from type exports** — never mix in the same statement.
3. **Section comments group by concern** (Factories, Types).
4. **Utils, constants, and test files are NEVER exported from barrels** — they are internal. Tests import them directly via relative path.
5. **Internal-only types (e.g. `Resolved*Options`, internal generics) are NOT exported** — implementation infrastructure stays internal.

### Format

```ts
// {Module} barrel — single import point for {module} internals.
// Public API is exported from the package index.

// Factories
export { createScheduler } from "./scheduler";

// Types
export type {
  Scheduler,
  SchedulerConfig,
  SchedulerResult,
} from "./scheduler.types";
```

Package root barrels use the package name:

```ts
// @my-org/my-package
// Brief package description
```

### What barrels DON'T export

- `*.utils.ts` functions (internal helpers)
- `*.constants.ts` values (internal)
- `*.test.ts` anything
- `test.utils.ts` anything
- Internal generics and infrastructure types
- `Resolved*Options` types (internal after-defaults types)

---

## Type Conventions

### All interface fields are `readonly`

No exceptions. Every field on every interface uses `readonly`:

```ts
export interface SchedulerConfig {
  readonly name: string;
  readonly interval?: number;
  readonly maxRetries?: number;
  readonly callbacks?: Readonly<Record<string, CallbackDef>>;
}
```

### Collections use `Readonly` wrappers

- Maps: `Readonly<Record<string, T>>`
- Arrays: `ReadonlyArray<T>` or `readonly T[]`

```ts
readonly steps: ReadonlyArray<Task>;
readonly metadata?: readonly Tag[];
readonly handlers?: Readonly<Record<string, Handler>>;
```

### Required vs optional fields

- **Required**: identity + core behavior. Listed first.
- **Optional**: everything with a default, lifecycle callbacks, cancellation. Documented with `@default`.

```ts
export interface PipelineConfig {
  readonly name: string;              // required — identity
  readonly steps: ReadonlyArray<Task>;// required — core behavior
  readonly callbacks?: Callbacks;     // optional — lifecycle
  readonly abort?: AbortSignal;       // optional — cancellation
}
```

### Resolved companion type pattern

When a config has optional fields that become required after defaults:

```ts
export interface Options {
  /** Max chars. 0 = unlimited. @default 0 */
  readonly truncate?: number;
  /** Enable verbose logging. @default false */
  readonly verbose?: boolean;
}

export interface ResolvedOptions {
  readonly truncate: number;   // no longer optional
  readonly verbose: boolean;
}
```

### Discriminated unions

Use `readonly type` as the discriminant:

```ts
export type StreamEvent =
  | { readonly type: "data"; readonly payload: string }
  | { readonly type: "error"; readonly error: Error }
  | { readonly type: "done"; readonly result: Result };
```

### Interface extension for specialization

```ts
export interface DetailedResult extends BaseResult {
  readonly metadata: readonly ResponseMessage[];
  readonly steps: ReadonlyArray<StepResult>;
}

export interface RetryConfig extends BaseConfig {
  readonly maxRetries?: number;
  readonly backoff?: number;
}
```

---

## Factory Function Pattern

No classes. Every module uses a factory function that captures mutable state in closure and returns a plain object literal.

### Structure

```ts
export function createProcessor(config: ProcessorConfig): Processor {
  // -- Closure state --
  const buffer = createBuffer(config.bufferConfig);
  let initialized = false;

  // Mutable callback store — shallow-copy from config, append pushes here.
  const callbacks = {
    beforeProcess: config.callbacks?.beforeProcess
      ? [...config.callbacks.beforeProcess]
      : undefined,
    afterProcess: config.callbacks?.afterProcess
      ? [...config.callbacks.afterProcess]
      : undefined,
  };

  // -- Internal helpers --
  function markInitialized(): boolean {
    const was = initialized;
    if (!was) initialized = true;
    return was;
  }

  async function execute(input: string): Promise<ProcessResult> { ... }

  // -- The returned object --
  const processor: Processor = {
    name: config.name,
    config,

    async process(input: string): Promise<ProcessResult> {
      // 1. Transform input
      // 2. Before process (side-effect)
      // 3. Execute
      // 4. After process (side-effect)
      // 5. Transform output
      return { ...result, text: transformedOutput };
    },

    reset(): void {
      initialized = false;
      buffer.clear();
    },

    appendCallback(callbackName: string, fn: unknown): void {
      // replace-on-append: store[key] = [...(store[key] ?? []), fn]
    },
  };

  return processor;
}
```

### Key principles

1. **Config callbacks are spread into new arrays** (`[...config.callbacks.beforeProcess]`) — the original config is never mutated.
2. **Append uses replace-on-append**: `store[key] = [...(store[key] ?? []), fn]`.
3. **Internal helpers are regular functions in closure** — no `this` binding.
4. **Lifecycle steps are numbered** with inline comments (1. Transform, 2. Before, 3. Execute, 4. After, 5. Transform).
5. **Specialized factories delegate to a shared builder** — they only provide the execution logic.

### Delegation pattern

When multiple factory variants share lifecycle logic, a shared builder handles the common orchestration and each variant supplies only its execution strategy:

```ts
export function createSequentialPipeline(config: PipelineConfig): Processor {
  return buildPipeline(config, "sequential", { ...config.callbacks }, async (steps, input, ctx) => {
    let current = input;
    for (const step of steps) {
      const result = await ctx.runStep(step, current);
      current = result.text;
    }
    return current;
  });
}
```

---

## Utils File Pattern

### What goes in utils

- Pure/stateless helper functions (no side effects, no captured external state)
- Builder functions that construct data objects from inputs
- Text formatters and manipulation functions

### What stays in the main domain file

- The factory function
- Closure state management
- The returned object literal
- Orchestration logic (lifecycle, execution loop)

### Export pattern

Utils functions are `export function` (for testability and co-located imports) but are **never re-exported from barrels**:

```ts
// scheduler.utils.ts line 2:
// Internal helpers, not exported from the package barrel.
```

Tests import utils directly:

```ts
import { buildSchedule } from "./scheduler.utils";
import { breakLines } from "./debug.utils";
```

---

## Comment and Documentation Style

### No section separators

**Do NOT use section separator lines.** Lines like `// ---------------------------------------------------------------------------` are prohibited. They add visual noise without value. Use blank lines and comment headers where needed.

### File-level comment (line 1, always)

Single-line `//` comment. Multi-line uses consecutive `//` lines. Never `/* */` block comments for file headers.

```ts
// Scheduler utility functions.
```

```ts
// createProcessor — Closure-based processing factory.
//
// The core factory for data processors. Returns a Processor with
// all lifecycle methods populated.
//
// State is captured in closure — no classes.
```

Barrel files use a two-line formula:

```ts
// Scheduler module barrel — single import point for scheduler internals.
// Public API is exported from the package index.
```

### Sub-section comments within functions

Use `// --` prefix:

```ts
// -- Closure state --
const buffer = createBuffer(config.bufferConfig);

// -- Internal helpers --
function markInitialized(): boolean { ... }

// -- The returned object --
const processor: Processor = { ... };
```

### JSDoc

**Exported factory functions and interfaces** get full JSDoc with `@example`:

```ts
/**
 * Create a data processor using closure-based state management.
 *
 * @example
 * ```ts
 * const proc = createProcessor({ name: "parser", bufferSize: 1024 });
 * ```
 */
export function createProcessor(config: ProcessorConfig): Processor {
```

**Interface fields** get single-line `/** */` with optional `@default`:

```ts
/** Unique name for this processor. */
readonly name: string;
/** Whether to buffer output. @default false */
readonly buffered?: boolean;
```

**Internal functions** get simpler JSDoc (no `@example`):

```ts
/** Fill in defaults for any unset options. */
export function resolveOptions(options?: Options): ResolvedOptions {
```

**Implementation-only API** uses `@internal`:

```ts
/** @internal Used by hookInto* — not part of the public API. */
appendCallback?(callbackName: string, fn: unknown): void;
```

### Inline comments

Numbered steps in orchestration code:

```ts
// 1. Transform input
const transformed = await runTransformCallbacks(...);
// 2. Before process
await runSideEffectCallbacks(...);
// 3. Execute
const result = await execute(transformed);
// 4. After process
await runSideEffectCallbacks(...);
// 5. Transform output
const finalText = await runTransformCallbacks(...);
```

ESLint disables always include a reason:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party generics are complex
```

---

## Test Philosophy

### Tests are specifications, not afterthoughts

Tests define expected behavior using a **black-box approach**. A test describes *what should happen*, not *what the code currently does*.

**When a test fails:**

1. **Do NOT modify the test to match the implementation.** The test represents the intended behavior.
2. **Review the implementation** to determine where the logic breaks.
3. **Fix the implementation** to satisfy the test's expectations.
4. If the test's expectation is genuinely wrong (e.g., based on a misunderstanding of requirements), **ask the user** before changing it.

This means tests should be written (or at minimum, the expected behavior should be defined) **before** implementation when possible. When adding functionality, write the test that describes what the correct output should be, then make the code pass it.

### Never fit tests to functions

If you find yourself thinking "the function returns X so the test should expect X" — stop. The question is "what *should* the function return?" If the answer differs from what it currently returns, the function has a bug.

---

## Test File Pattern

### Import order

1. `bun:test` (always first)
2. Module under test / external packages
3. Types needed for assertions
4. Internal utils (imported directly, not through barrel)

```ts
import { describe, expect, it } from "bun:test";
import { createProcessor } from "./processor";
import type { ProcessResult } from "./processor.types";
import { buildSchedule } from "./scheduler.utils";
```

Cross-package imports use the package name (`@my-org/my-package`), not relative paths into another package's internals.

### File-level comment

```ts
// Tests for createProcessor — closure-based processing factory.
```

### Helpers

Inline helpers at the top of the file, before `describe` blocks, with `/** */` JSDoc:

```ts
/** Capture output lines into an array instead of console.log. */
function createCapture(): { lines: string[]; output: (line: string) => void } {
  const lines: string[] = [];
  return { lines, output: (line: string) => lines.push(line) };
}

/** Create a mock processor with a fixed response. */
function makeMock(name: string, response: string) {
  return createProcessor({
    name,
    execute: async (_input) => response,
  });
}
```

Shared helpers across a module go in `test.utils.ts` (never `test-helpers.ts`, `helpers.ts`, or `mocks.ts`). Test utility files are **never exported from barrels**.

### Structure

- **Top-level `describe`** matches the function/module name.
- **Nested `describe`** groups related scenarios.
- **`it` descriptions** use `"should"` prefix: `"should truncate long messages"`.

```ts
describe("createProcessor", () => {
  it("should return a valid Processor", () => { ... });
  it("should execute the lifecycle in order", () => { ... });
});

describe("resolveOptions", () => { ... });
```

### Assertions

- Use inline literals, not shared fixtures.
- Exact structural comparison with `toEqual` for object shapes.
- Side-effect tracking with `log: string[]` arrays.
- `!` non-null assertions on array indices and optional methods in test code (test knows the index/method is valid).

```ts
expect(result.usage).toEqual({ input: 0, output: 0 });
expect(calls[0]!).toContain("hello");
await processor.stream!("message");
```
