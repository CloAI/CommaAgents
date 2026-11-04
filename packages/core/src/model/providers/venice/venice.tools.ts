import { randomUUID } from "node:crypto";
import { z } from "zod";
import { privacyError } from "../../privacy/privacy.utils";
import type {
  VeniceToolPolicy,
  VeniceToolRequest,
  VeniceToolDecodeFailure,
} from "./venice.types";
import type { VeniceCompletionToolCall } from "./venice.stream";

const toolSchema = z
  .object({
    type: z.literal("function"),
    function: z
      .object({
        name: z.string().min(1),
        description: z.string().optional(),
        parameters: z.record(z.unknown()),
        strict: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();
const historyCallSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("function"),
    function: z
      .object({ name: z.string().min(1), arguments: z.string() })
      .strict(),
  })
  .strict();
const choiceSchema = z.union([
  z.enum(["auto", "none", "required"]),
  z
    .object({
      type: z.literal("function"),
      function: z.object({ name: z.string().min(1) }).strict(),
    })
    .strict(),
]);
const callSchema = z
  .object({
    name: z.string().min(1),
    arguments: z.record(z.unknown()),
  })
  .strict();
const OPEN_CALL = "<comma_tool_call>";
const CLOSE_CALL = "</comma_tool_call>";

/**
 * Fold tool schemas and history into message text before message encryption.
 * @param {VeniceToolRequest} request - Validated text request, updated in place.
 * @returns {VeniceToolPolicy} Names and selection rules for local response decoding.
 */
export function prepareVeniceTools(
  request: VeniceToolRequest,
): VeniceToolPolicy {
  const parsedTools = z.array(toolSchema).safeParse(request.tools ?? []);
  const parsedChoice = choiceSchema.safeParse(request.tool_choice ?? "auto");
  if (
    !parsedTools.success ||
    !parsedChoice.success ||
    (request.parallel_tool_calls !== undefined &&
      typeof request.parallel_tool_calls !== "boolean")
  ) {
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
  const tools = parsedTools.data;
  const choice = parsedChoice.data;
  const names = tools.map((tool) => tool.function.name);
  if (
    new Set(names).size !== names.length ||
    (typeof choice === "object" && !names.includes(choice.function.name)) ||
    (choice === "required" && !names.length)
  ) {
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
  const policy: VeniceToolPolicy = {
    names:
      choice === "none"
        ? []
        : typeof choice === "object"
          ? [choice.function.name]
          : names,
    required: choice === "required" || typeof choice === "object",
    parallel: request.parallel_tool_calls !== false,
    parameterNames: Object.fromEntries(
      tools.map((tool) => {
        const properties = tool.function.parameters.properties;
        return [
          tool.function.name,
          properties &&
          typeof properties === "object" &&
          !Array.isArray(properties)
            ? Object.keys(properties)
            : [],
        ];
      }),
    ),
  };
  request.messages = request.messages.map((message) => {
    let content = "";
    if (typeof message.content === "string") {
      content = message.content;
    } else if (Array.isArray(message.content)) {
      const parts = z
        .array(z.object({ type: z.literal("text"), text: z.string() }).strict())
        .safeParse(message.content);
      if (!parts.success) {
        throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
      }
      content = parts.data.map((part) => part.text).join("");
    } else if (message.content != null) {
      throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
    }
    if (message.role === "assistant" && message.tool_calls !== undefined) {
      const calls = z.array(historyCallSchema).safeParse(message.tool_calls);
      if (!calls.success) {
        throw privacyError("PRIVACY_CONFIGURATION_ERROR");
      }
      for (const call of calls.data) {
        let argumentsValue: unknown;
        try {
          argumentsValue = JSON.parse(call.function.arguments) as unknown;
        } catch {
          throw privacyError("PRIVACY_CONFIGURATION_ERROR");
        }
        if (!z.record(z.unknown()).safeParse(argumentsValue).success) {
          throw privacyError("PRIVACY_CONFIGURATION_ERROR");
        }
        content += `\n${OPEN_CALL}${JSON.stringify({ id: call.id, name: call.function.name, arguments: argumentsValue })}${CLOSE_CALL}`;
      }
    } else if (
      message.tool_calls !== undefined ||
      message.function_call !== undefined
    ) {
      throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
    }
    if (message.role === "tool") {
      if (typeof message.tool_call_id !== "string" || !message.tool_call_id) {
        throw privacyError("PRIVACY_CONFIGURATION_ERROR");
      }
      // Keep result identity and contents inside the encrypted message, too.
      return {
        role: "user",
        content: `<comma_tool_result>${JSON.stringify({ id: message.tool_call_id, content })}</comma_tool_result>`,
      };
    }
    if (!["system", "developer", "user", "assistant"].includes(message.role)) {
      throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
    }
    return {
      role: message.role === "developer" ? "system" : message.role,
      content,
    };
  });
  if (policy.names.length) {
    request.messages.unshift({
      role: "system",
      content: [
        "You may request tools that execute on the user's computer.",
        `Emit each request as ${OPEN_CALL}{"name":"tool_name","arguments":{"parameter":"value"}}${CLOSE_CALL}.`,
        "Use valid JSON objects for arguments. Keep these blocks outside markdown fences. Do not invent tool names or results.",
        "The outer object must contain only name and arguments. Put every parameter inside the arguments object, including array parameters.",
        "Prior assistant requests include an id; matching comma_tool_result messages contain the local tool result.",
        policy.required
          ? "You must request a tool in this response."
          : "Answer normally when no tool is needed.",
        policy.parallel
          ? "You may request multiple tools."
          : "Request at most one tool in this response.",
        "Available tools (JSON):",
        JSON.stringify(
          tools.filter((tool) => policy.names.includes(tool.function.name)),
        ),
      ].join("\n"),
    });
  }
  delete request.tools;
  delete request.tool_choice;
  delete request.parallel_tool_calls;
  return policy;
}

/**
 * Convert explicit tool blocks from decrypted assistant text to local tool calls.
 * @param {string} content - Complete decrypted assistant content, never reasoning.
 * @param {string} finishReason - Upstream termination reason.
 * @param {VeniceToolPolicy} policy - Tools offered for this request.
 * @param {Function} [onFailure] - Receive a content-free decoding failure category.
 * @returns {{ content: string; calls: VeniceCompletionToolCall[] }} Prose and validated calls.
 */
export function parseVeniceTools(
  content: string,
  finishReason: string,
  policy: VeniceToolPolicy,
  onFailure?: (reason: VeniceToolDecodeFailure) => void,
): { content: string; calls: VeniceCompletionToolCall[] } {
  const reject = (reason: VeniceToolDecodeFailure) => {
    onFailure?.(reason);
    return privacyError("PRIVACY_INVALID_RESPONSE");
  };
  const calls: VeniceCompletionToolCall[] = [];
  const prose: string[] = [];
  let remaining = content;
  while (remaining.includes(OPEN_CALL)) {
    const start = remaining.indexOf(OPEN_CALL);
    prose.push(remaining.slice(0, start));
    const payloadStart = start + OPEN_CALL.length;
    let payloadEnd = payloadStart;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let opened = false;
    // A closing marker inside a JSON string is an argument value, not a delimiter.
    for (; payloadEnd < remaining.length; payloadEnd++) {
      const character = remaining[payloadEnd];
      if (quoted) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          quoted = false;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === "{" || character === "[") {
        opened = true;
        depth++;
      } else if (character === "}" || character === "]") {
        if (--depth === 0) {
          payloadEnd++;
          break;
        }
      } else if (!opened && character?.trim()) {
        throw reject("invalid-tool-envelope");
      }
    }
    const suffix = remaining.slice(payloadEnd);
    const whitespace = suffix.length - suffix.trimStart().length;
    const end = payloadEnd + whitespace;
    if (
      !opened ||
      depth !== 0 ||
      !remaining.startsWith(CLOSE_CALL, end) ||
      finishReason !== "stop"
    ) {
      throw reject("invalid-tool-envelope");
    }
    let value: unknown;
    try {
      value = JSON.parse(remaining.slice(payloadStart, payloadEnd)) as unknown;
    } catch {
      throw reject("invalid-tool-json");
    }
    let parsed = callSchema.safeParse(value);
    if (!parsed.success) {
      const flattened = z.record(z.unknown()).safeParse(value);
      if (
        flattened.success &&
        typeof flattened.data.name === "string" &&
        !Object.hasOwn(flattened.data, "arguments")
      ) {
        const name = flattened.data.name;
        const declared = policy.parameterNames?.[name] ?? [];
        const fields = Object.keys(flattened.data).filter(
          (field) => field !== "name",
        );
        if (
          policy.names.includes(name) &&
          fields.length > 0 &&
          fields.every((field) => declared.includes(field))
        ) {
          parsed = callSchema.safeParse({
            name,
            arguments: Object.fromEntries(
              fields.map((field) => [field, flattened.data[field]]),
            ),
          });
        }
      }
    }
    if (!parsed.success) {
      throw reject("invalid-tool-schema");
    }
    if (!policy.names.includes(parsed.data.name)) {
      throw reject("unoffered-tool");
    }
    calls.push({
      id: `call_${randomUUID()}`,
      type: "function",
      function: {
        name: parsed.data.name,
        arguments: JSON.stringify(parsed.data.arguments),
      },
    });
    remaining = remaining.slice(end + CLOSE_CALL.length);
  }
  if (
    remaining.includes(CLOSE_CALL) ||
    (policy.required && !calls.length) ||
    (!policy.parallel && calls.length > 1)
  ) {
    throw reject("tool-selection-violation");
  }
  prose.push(remaining);
  return { content: prose.join(""), calls };
}
