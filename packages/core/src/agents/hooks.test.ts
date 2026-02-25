// Tests for agent hook middleware (agents/hooks.ts)

import { describe, expect, it } from "bun:test";
import type { AgentHooks } from "../hooks/types";
import {
  resolveHook,
  runAfterCallHooks,
  runAlterMessageHooks,
  runAlterResponseHooks,
  runBeforeCallHooks,
  withAgentHooks,
} from "./hooks";
import type { AgentCallResult } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal AgentCallResult for testing. */
function makeResult(text: string): AgentCallResult {
  return {
    text,
    steps: [],
    usage: { promptTokens: 0, completionTokens: 0 },
    finishReason: "stop",
  };
}

/** A simple execute function that prefixes the message. */
async function echoExecute(message: string): Promise<AgentCallResult> {
  return makeResult(`echo:${message}`);
}

// ---------------------------------------------------------------------------
// resolveHook
// ---------------------------------------------------------------------------

describe("resolveHook", () => {
  const initial = [() => "initial"];
  const regular = [() => "regular"];

  it("should return initial hooks on first call when defined", () => {
    expect(resolveHook(initial, regular, true)).toBe(initial);
  });

  it("should fall back to regular hooks on first call when initial undefined", () => {
    expect(resolveHook(undefined, regular, true)).toBe(regular);
  });

  it("should return regular hooks on subsequent calls", () => {
    expect(resolveHook(initial, regular, false)).toBe(regular);
  });

  it("should return undefined when no hooks defined", () => {
    expect(resolveHook(undefined, undefined, true)).toBeUndefined();
    expect(resolveHook(undefined, undefined, false)).toBeUndefined();
  });

  it("should ignore initial hooks on subsequent calls even if defined", () => {
    expect(resolveHook(initial, undefined, false)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Individual hook runners
// ---------------------------------------------------------------------------

describe("runAlterMessageHooks", () => {
  it("should transform the message", async () => {
    const hooks: AgentHooks = {
      alterCallMessage: [(msg) => `[altered] ${msg}`],
    };
    const result = await runAlterMessageHooks(hooks, "hello", false);
    expect(result).toBe("[altered] hello");
  });

  it("should use initial variant on first call", async () => {
    const hooks: AgentHooks = {
      alterInitialCallMessage: [(msg) => `[initial] ${msg}`],
      alterCallMessage: [(msg) => `[regular] ${msg}`],
    };
    expect(await runAlterMessageHooks(hooks, "msg", true)).toBe("[initial] msg");
    expect(await runAlterMessageHooks(hooks, "msg", false)).toBe("[regular] msg");
  });

  it("should return message unchanged when no hooks", async () => {
    expect(await runAlterMessageHooks(undefined, "hello", true)).toBe("hello");
  });
});

describe("runBeforeCallHooks", () => {
  it("should run side effects", async () => {
    const calls: string[] = [];
    const hooks: AgentHooks = {
      beforeCall: [
        (msg) => {
          calls.push(msg);
        },
      ],
    };
    await runBeforeCallHooks(hooks, "test", false);
    expect(calls).toEqual(["test"]);
  });
});

describe("runAfterCallHooks", () => {
  it("should run side effects with response", async () => {
    const calls: string[] = [];
    const hooks: AgentHooks = {
      afterCall: [
        (resp) => {
          calls.push(resp);
        },
      ],
    };
    await runAfterCallHooks(hooks, "response", false);
    expect(calls).toEqual(["response"]);
  });
});

describe("runAlterResponseHooks", () => {
  it("should transform the response", async () => {
    const hooks: AgentHooks = {
      alterResponse: [(r) => `[processed] ${r}`],
    };
    const result = await runAlterResponseHooks(hooks, "raw", false);
    expect(result).toBe("[processed] raw");
  });
});

// ---------------------------------------------------------------------------
// withAgentHooks — the main middleware
// ---------------------------------------------------------------------------

describe("withAgentHooks", () => {
  it("should pass through when no hooks", async () => {
    const hooked = withAgentHooks(undefined, echoExecute);
    const { result, alteredMessage } = await hooked("hello", true);

    expect(result.text).toBe("echo:hello");
    expect(alteredMessage).toBe("hello");
  });

  it("should alter message before execute", async () => {
    const hooks: AgentHooks = {
      alterCallMessage: [(msg) => `[prefix] ${msg}`],
    };
    const hooked = withAgentHooks(hooks, echoExecute);
    const { result, alteredMessage } = await hooked("hello", false);

    expect(alteredMessage).toBe("[prefix] hello");
    expect(result.text).toBe("echo:[prefix] hello");
  });

  it("should alter response after execute", async () => {
    const hooks: AgentHooks = {
      alterResponse: [(r) => `[post] ${r}`],
    };
    const hooked = withAgentHooks(hooks, echoExecute);
    const { result } = await hooked("hello", false);

    expect(result.text).toBe("[post] echo:hello");
  });

  it("should run before and after side-effect hooks", async () => {
    const order: string[] = [];
    const hooks: AgentHooks = {
      beforeCall: [
        () => {
          order.push("before");
        },
      ],
      afterCall: [
        () => {
          order.push("after");
        },
      ],
    };
    const hooked = withAgentHooks(hooks, async (msg) => {
      order.push("execute");
      return makeResult(msg);
    });

    await hooked("test", false);
    expect(order).toEqual(["before", "execute", "after"]);
  });

  it("should run full lifecycle in correct order", async () => {
    const order: string[] = [];
    const hooks: AgentHooks = {
      alterCallMessage: [
        (msg) => {
          order.push("alter-msg");
          return `altered:${msg}`;
        },
      ],
      beforeCall: [
        () => {
          order.push("before");
        },
      ],
      afterCall: [
        () => {
          order.push("after");
        },
      ],
      alterResponse: [
        (r) => {
          order.push("alter-resp");
          return `final:${r}`;
        },
      ],
    };
    const hooked = withAgentHooks(hooks, async (msg) => {
      order.push("execute");
      return makeResult(msg);
    });

    const { result } = await hooked("start", false);
    expect(order).toEqual(["alter-msg", "before", "execute", "after", "alter-resp"]);
    expect(result.text).toBe("final:altered:start");
  });

  it("should use initial hooks on first call", async () => {
    const calls: string[] = [];
    const hooks: AgentHooks = {
      beforeInitialCall: [
        () => {
          calls.push("initial-before");
        },
      ],
      beforeCall: [
        () => {
          calls.push("regular-before");
        },
      ],
    };
    const hooked = withAgentHooks(hooks, echoExecute);

    await hooked("first", true);
    expect(calls).toEqual(["initial-before"]);

    calls.length = 0;
    await hooked("second", false);
    expect(calls).toEqual(["regular-before"]);
  });

  it("should fall back to regular hooks when initial not defined", async () => {
    const calls: string[] = [];
    const hooks: AgentHooks = {
      beforeCall: [
        () => {
          calls.push("fallback");
        },
      ],
    };
    const hooked = withAgentHooks(hooks, echoExecute);

    await hooked("first", true);
    expect(calls).toEqual(["fallback"]);
  });

  it("should chain multiple alter hooks", async () => {
    const hooks: AgentHooks = {
      alterCallMessage: [(m) => `A:${m}`, (m) => `B:${m}`],
      alterResponse: [(r) => `X:${r}`, (r) => `Y:${r}`],
    };
    const hooked = withAgentHooks(hooks, echoExecute);
    const { result, alteredMessage } = await hooked("start", false);

    expect(alteredMessage).toBe("B:A:start");
    expect(result.text).toBe("Y:X:echo:B:A:start");
  });

  it("should preserve non-text fields in result", async () => {
    const execute = async (_msg: string): Promise<AgentCallResult> => ({
      text: "response",
      steps: [],
      usage: { promptTokens: 42, completionTokens: 99 },
      finishReason: "tool-calls",
    });
    const hooks: AgentHooks = {
      alterResponse: [(r) => `altered:${r}`],
    };
    const hooked = withAgentHooks(hooks, execute);
    const { result } = await hooked("test", false);

    expect(result.text).toBe("altered:response");
    expect(result.usage.promptTokens).toBe(42);
    expect(result.usage.completionTokens).toBe(99);
    expect(result.finishReason).toBe("tool-calls");
  });
});
