import { describe, expect, it } from "bun:test";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, jsonSchema, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import {
  decryptVeniceChunk,
  encryptVeniceMessage,
  generateVeniceKeyPair,
} from "./venice.crypto";
import { parseVeniceStream } from "./venice.stream";
import { parseVeniceTools, prepareVeniceTools } from "./venice.tools";
import type { VeniceToolPolicy, VeniceToolRequest } from "./venice.types";

const definition = {
  type: "function",
  function: {
    name: "read_local",
    description: "Read a private local file",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
};
const policy: VeniceToolPolicy = {
  names: ["read_local"],
  required: false,
  parallel: true,
};
const call =
  '<comma_tool_call>{"name":"read_local","arguments":{"path":"/private/file"}}</comma_tool_call>';

describe("Venice encrypted local tools", () => {
  it("should carry tool definitions, assistant calls, and local results inside encrypted message content", () => {
    const request: VeniceToolRequest = {
      tools: [definition],
      tool_choice: "auto",
      parallel_tool_calls: false,
      messages: [
        { role: "system", content: "Keep files private" },
        { role: "user", content: [{ type: "text", text: "Read my file" }] },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "read_local",
                arguments: '{"path":"/private/file"}',
              },
            },
          ],
        },
        { role: "tool", tool_call_id: "call-1", content: "private-result" },
        { role: "assistant", content: "Here is the result" },
      ],
    };
    expect(prepareVeniceTools(request)).toMatchObject({
      ...policy,
      parallel: false,
    });
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("tool_choice");
    expect(request).not.toHaveProperty("parallel_tool_calls");
    expect(request.messages[0]?.content).toContain("Read a private local file");
    expect(request.messages[3]?.content).toContain('"path":"/private/file"');
    expect(request.messages[4]?.content).toContain(
      '"id":"call-1","content":"private-result"',
    );
    const recipient = generateVeniceKeyPair();
    const encrypted = request.messages.map((message) => ({
      ...message,
      content: encryptVeniceMessage(
        String(message.content),
        recipient.publicKey,
      ),
    }));
    const wire = JSON.stringify({ ...request, messages: encrypted });
    for (const secret of [
      "read_local",
      "/private/file",
      "private-result",
      "call-1",
    ]) {
      expect(wire).not.toContain(secret);
    }
    expect(
      encrypted.map((message) =>
        decryptVeniceChunk(message.content, recipient.privateKey),
      ),
    ).toEqual(request.messages.map((message) => String(message.content)));
    recipient.privateKey.fill(0);
  });

  it("should enforce none, required, forced, and parallel tool selection", () => {
    for (const choice of [
      "none",
      "required",
      { type: "function", function: { name: "read_local" } },
    ]) {
      const request = {
        tools: [definition],
        tool_choice: choice,
        messages: [],
      };
      const selection = prepareVeniceTools(request);
      if (choice === "none") {
        expect(selection.names).toEqual([]);
        expect(request.messages).toHaveLength(0);
        expect(() => parseVeniceTools(call, "stop", selection)).toThrow();
      } else {
        expect(selection.required).toBe(true);
        expect(() => parseVeniceTools("No call", "stop", selection)).toThrow();
      }
    }
    expect(() =>
      parseVeniceTools(call + call, "stop", { ...policy, parallel: false }),
    ).toThrow();
    const result = parseVeniceTools(
      `Reading now.\n${call}${call}`,
      "stop",
      policy,
    );
    expect(result.content).toBe("Reading now.\n");
    expect(result.calls).toHaveLength(2);
    expect(result.calls[0]?.id).not.toBe(result.calls[1]?.id);
  });

  it("should normalize flattened delegation fields only when declared by the offered tool", () => {
    const request: VeniceToolRequest = {
      messages: [],
      tools: [
        {
          type: "function",
          function: {
            name: "delegate",
            parameters: {
              type: "object",
              properties: {
                tasks: { type: "array", items: { type: "object" } },
              },
            },
          },
        },
      ],
    };
    const selection = prepareVeniceTools(request);
    const tasks = [
      {
        agent: "explore",
        description: "Review packages",
        goal: "Suggest commit groups",
        context: "Private context",
      },
    ];
    const flattened = `<comma_tool_call>${JSON.stringify({ name: "delegate", tasks })}</comma_tool_call>`;
    const decoded = parseVeniceTools(flattened, "stop", selection);
    expect(decoded.calls[0]?.function.name).toBe("delegate");
    expect(JSON.parse(decoded.calls[0]!.function.arguments)).toEqual({ tasks });
    for (const candidate of [
      { name: "delegate", tasks, undeclared: "private" },
      { name: "delegate", arguments: { tasks }, tasks },
      { name: "unoffered", tasks },
      { name: "delegate", arguments: tasks },
    ]) {
      expect(() =>
        parseVeniceTools(
          `<comma_tool_call>${JSON.stringify(candidate)}</comma_tool_call>`,
          "stop",
          selection,
        ),
      ).toThrow();
    }
    expect(() =>
      parseVeniceTools(flattened, "stop", { ...selection, names: [] }),
    ).toThrow();
    expect(() =>
      parseVeniceTools(flattened, "stop", {
        ...selection,
        parameterNames: undefined,
      }),
    ).toThrow();
    const reasons: string[] = [];
    expect(() =>
      parseVeniceTools(
        flattened.replace("</comma_tool_call>", ""),
        "stop",
        selection,
        (reason) => {
          reasons.push(reason);
        },
      ),
    ).toThrow();
    expect(reasons).toEqual(["invalid-tool-envelope"]);
  });

  it("should validate normalized input before executing a local tool", async () => {
    const recipient = generateVeniceKeyPair();
    const executed: string[] = [];
    const model = createOpenAI({
      apiKey: "test",
      baseURL: "https://local-test.invalid/v1",
      fetch: Object.assign(
        async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
          const request = JSON.parse(String(init?.body)) as VeniceToolRequest;
          const selection = prepareVeniceTools(request);
          const frame = {
            id: "completion",
            model: "model",
            choices: [
              {
                index: 0,
                delta: {
                  content: encryptVeniceMessage(
                    '<comma_tool_call>{"name":"read_local","path":7}</comma_tool_call>',
                    recipient.publicKey,
                  ),
                },
                finish_reason: "stop",
              },
            ],
          };
          const decoded = parseVeniceStream(
            Buffer.from(`data: ${JSON.stringify(frame)}\n\ndata: [DONE]\n\n`),
            {
              privateKey: recipient.privateKey,
              maxPlaintextBytes: 4096,
              toolPolicy: selection,
            },
          );
          return Response.json(decoded.completion);
        },
        { preconnect: fetch.preconnect },
      ),
    }).chat("model");
    const result = await generateText({
      model,
      prompt: "Read the file",
      maxRetries: 0,
      tools: {
        read_local: tool({
          inputSchema: z.object({ path: z.string() }),
          execute: async ({ path }) => {
            executed.push(path);
            return "should not run";
          },
        }),
      },
    });
    expect(executed).toEqual([]);
    expect(result.toolCalls).toMatchObject([
      { toolName: "read_local", invalid: true },
    ]);
    recipient.privateKey.fill(0);
  });

  it("should preserve nested JSON and delimiter strings inside tool arguments", () => {
    const argumentsValue = {
      path: "</comma_tool_call>",
      nested: [{ value: 'a "quote" and a \\ slash' }],
    };
    const text = `<comma_tool_call>${JSON.stringify({ name: "read_local", arguments: argumentsValue })}</comma_tool_call>`;
    expect(
      JSON.parse(
        parseVeniceTools(text, "stop", policy).calls[0]!.function.arguments,
      ),
    ).toEqual(argumentsValue);
  });

  it("should reject malformed, unknown, disabled, and truncated calls before execution", () => {
    for (const content of [
      call.replace("read_local", "invented_tool"),
      call.replace(
        '"arguments":{"path":"/private/file"}',
        '"arguments":"not-an-object"',
      ),
      call.replace('{"name"', '{bad "name"'),
      call.replace("</comma_tool_call>", ""),
    ]) {
      expect(() => parseVeniceTools(content, "stop", policy)).toThrow();
    }
    expect(() => parseVeniceTools(call, "length", policy)).toThrow();
    expect(
      parseVeniceTools('{"name":"read_local","arguments":{}}', "stop", policy)
        .calls,
    ).toHaveLength(0);
    for (const request of [
      {
        tools: [definition],
        tool_choice: { type: "function", function: { name: "unknown" } },
        messages: [],
      },
      { tools: [], tool_choice: "required", messages: [] },
      { tools: [definition, definition], messages: [] },
      {
        messages: [
          {
            role: "user",
            content: [{ type: "image_url", image_url: "private-image" }],
          },
        ],
      },
      { messages: [{ role: "tool", content: "orphan result" }] },
    ]) {
      expect(() => prepareVeniceTools(request)).toThrow();
    }
  });

  it("should decode encrypted tool blocks split across SSE chunks and retain reasoning", () => {
    const recipient = generateVeniceKeyPair();
    const fragments = [call.slice(0, 7), call.slice(7, 47), call.slice(47)];
    const frames = `${fragments
      .map(
        (content, index) =>
          `data: ${JSON.stringify({
            id: "completion",
            model: "model",
            choices: [
              {
                index: 0,
                delta: {
                  content: encryptVeniceMessage(content, recipient.publicKey),
                  ...(index === 0
                    ? {
                        reasoning_content: encryptVeniceMessage(
                          "Think privately",
                          recipient.publicKey,
                        ),
                      }
                    : {}),
                },
                finish_reason: index === fragments.length - 1 ? "stop" : null,
              },
            ],
          })}\n\n`,
      )
      .join("")}data: [DONE]\n\n`;
    const decoded = parseVeniceStream(Buffer.from(frames), {
      privateKey: recipient.privateKey,
      maxPlaintextBytes: 4096,
      toolPolicy: policy,
    });
    expect(decoded.completion.choices[0].finish_reason).toBe("tool_calls");
    expect(
      decoded.completion.choices[0].message.tool_calls?.[0]?.function,
    ).toEqual({ name: "read_local", arguments: '{"path":"/private/file"}' });
    expect(decoded.content).toBe("");
    expect(decoded.reasoning).toBe("Think privately");
    expect(decoded.body).toContain('"tool_calls"');
    expect(decoded.body).not.toContain("comma_tool_call");
    expect(() =>
      parseVeniceStream(Buffer.from(frames), {
        privateKey: recipient.privateKey,
        maxPlaintextBytes: 12,
        toolPolicy: policy,
      }),
    ).toThrow();
    recipient.privateKey.fill(0);
  });

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    "should execute a local tool and encrypt its result on the next generation (streaming=%s, flattened=%s)",
    async (streaming, flattened) => {
      const recipient = generateVeniceKeyPair();
      let requests = 0;
      const executed: string[] = [];
      const model = createOpenAI({
        apiKey: "test",
        baseURL: "https://local-test.invalid/v1",
        fetch: Object.assign(
          async (
            _input: Parameters<typeof fetch>[0],
            init?: Parameters<typeof fetch>[1],
          ) => {
            const request = JSON.parse(String(init?.body)) as VeniceToolRequest;
            const selection = prepareVeniceTools(request);
            const encrypted = request.messages.map((message) => ({
              ...message,
              content: encryptVeniceMessage(
                String(message.content),
                recipient.publicKey,
              ),
            }));
            expect(JSON.stringify(encrypted)).not.toContain("private-result");
            expect(JSON.stringify(encrypted)).not.toContain("read_local");
            if (requests > 0) {
              expect(
                request.messages.some((message) =>
                  String(message.content).includes("private-result"),
                ),
              ).toBe(true);
            }
            const toolCall = flattened
              ? '<comma_tool_call>{"name":"read_local","path":"/private/file"}</comma_tool_call>'
              : call;
            const content = requests++ === 0 ? toolCall : "Done";
            const frame = {
              id: `completion-${requests}`,
              model: "model",
              created: 1,
              choices: [
                {
                  index: 0,
                  delta: {
                    content: encryptVeniceMessage(content, recipient.publicKey),
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
              },
            };
            const decoded = parseVeniceStream(
              Buffer.from(`data: ${JSON.stringify(frame)}\n\ndata: [DONE]\n\n`),
              {
                privateKey: recipient.privateKey,
                maxPlaintextBytes: 8192,
                toolPolicy: selection,
              },
            );
            return new Response(
              request.stream
                ? decoded.body
                : JSON.stringify(decoded.completion),
              {
                headers: {
                  "Content-Type": request.stream
                    ? "text/event-stream"
                    : "application/json",
                },
              },
            );
          },
          { preconnect: globalThis.fetch.preconnect },
        ),
      }).chat("model");
      const options = {
        model,
        prompt: "Read my private file",
        stopWhen: stepCountIs(3),
        tools: {
          read_local: tool({
            description: "Read a private local file",
            inputSchema: jsonSchema<{ path: string }>({
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
              additionalProperties: false,
            }),
            async execute({ path }) {
              executed.push(path);
              return "private-result";
            },
          }),
        },
      };
      const result = streaming
        ? streamText(options)
        : await generateText(options);
      expect(await result.text).toBe("Done");
      expect(executed).toEqual(["/private/file"]);
      expect(requests).toBe(2);
      recipient.privateKey.fill(0);
    },
  );
});
