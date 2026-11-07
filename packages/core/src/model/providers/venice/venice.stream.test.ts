import { describe, expect, it } from "vitest";
import { encryptVeniceMessage, generateVeniceKeyPair } from "./venice.crypto";
import { parseVeniceStream } from "./venice.stream";

function streamBytes(chunks: readonly unknown[], done = true): Uint8Array {
  const frames = chunks
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join("");
  return new TextEncoder().encode(frames + (done ? "data: [DONE]\n\n" : ""));
}

function contentChunk(content: string, finishReason: "stop" | null = null) {
  return {
    id: "completion",
    model: "model",
    created: 1,
    choices: [{ index: 0, delta: { content }, finish_reason: finishReason }],
  };
}

describe("parseVeniceStream", () => {
  it("should accept validated stop and cost metadata without forwarding it or changing the signed wire bytes", () => {
    const recipient = generateVeniceKeyPair();
    for (const matchedStop of [null, 154827, "stop marker"]) {
      const chunk = contentChunk(
        encryptVeniceMessage("Hello", recipient.publicKey),
        "stop",
      );
      const payload = streamBytes([
        {
          ...chunk,
          choices: chunk.choices.map((choice) => ({
            ...choice,
            matched_stop: matchedStop,
          })),
        },
        {
          id: "completion",
          model: "model",
          choices: [],
          cost: { usd: 0.0000368, diem: 0 },
        },
      ]);
      const original = payload.slice();
      const result = parseVeniceStream(payload, {
        privateKey: recipient.privateKey,
        maxPlaintextBytes: 1024,
      });
      expect(result.content).toBe("Hello");
      expect(result.body).not.toContain("matched_stop");
      expect(result.body).not.toContain("cost");
      expect(payload).toEqual(original);
    }
    for (const cost of [
      { usd: -1, diem: 0 },
      { usd: "private", diem: 0 },
      { usd: 0, diem: 0, content: "plaintext" },
    ]) {
      expect(() =>
        parseVeniceStream(
          streamBytes([
            {
              ...contentChunk(
                encryptVeniceMessage("Hello", recipient.publicKey),
                "stop",
              ),
              cost,
            },
          ]),
          { privateKey: recipient.privateKey, maxPlaintextBytes: 1024 },
        ),
      ).toThrow();
    }
    recipient.privateKey.fill(0);
  });

  it("should decrypt full SSE frames while retaining event framing and numeric usage", () => {
    const recipient = generateVeniceKeyPair();
    const payload = streamBytes([
      {
        id: "completion",
        model: "model",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "" },
            finish_reason: null,
          },
        ],
      },
      {
        id: "completion",
        model: "model",
        created: 1,
        choices: [
          {
            index: 0,
            delta: {
              reasoning_content: encryptVeniceMessage(
                "reasoning",
                recipient.publicKey,
              ),
            },
            finish_reason: null,
          },
        ],
      },
      contentChunk(encryptVeniceMessage("Hello 世界", recipient.publicKey)),
      contentChunk(encryptVeniceMessage("!", recipient.publicKey), "stop"),
      {
        id: "completion",
        model: "model",
        choices: [],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      },
    ]);
    const result = parseVeniceStream(payload, {
      privateKey: recipient.privateKey,
      maxPlaintextBytes: 1024,
    });
    expect(result.content).toBe("Hello 世界!");
    expect(result.reasoning).toBe("reasoning");
    expect(result.completionId).toBe("completion");
    expect(result.modelId).toBe("model");
    expect(result.completion).toEqual({
      id: "completion",
      model: "model",
      created: 1,
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Hello 世界!",
            reasoning_content: "reasoning",
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    });
    expect(result.body).toContain('"content":"Hello 世界"');
    expect(result.body.endsWith("data: [DONE]\n\n")).toBe(true);
  });

  it("should parse multiline SSE data and CRLF framing without losing SSE metadata", () => {
    const json = JSON.stringify(contentChunk("text", "stop"), null, 2);
    const dataLines = json
      .split("\n")
      .map((line) => `data: ${line}`)
      .join("\r\n");
    const frame = `id: transport-id\r\nevent: message\r\n: heartbeat\r\n${dataLines}`;
    const result = parseVeniceStream(
      new TextEncoder().encode(`${frame}\r\n\r\ndata: [DONE]\r\n\r\n`),
      { maxPlaintextBytes: 1024 },
    );
    expect(result.content).toBe("text");
    expect(result.body).toContain(
      "id: transport-id\nevent: message\n: heartbeat\ndata:",
    );
  });

  it("should reconstruct ordinary TEE tool argument fragments for completed responses", () => {
    const payload = streamBytes([
      {
        id: "completion",
        model: "model",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "tool-1",
                  type: "function",
                  function: { name: "weather", arguments: '{"city":' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: "completion",
        model: "model",
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '"Paris"}' } }],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
    ]);
    const result = parseVeniceStream(payload, { maxPlaintextBytes: 1024 });
    expect(result.completion.choices[0].message.tool_calls).toEqual([
      {
        id: "tool-1",
        type: "function",
        function: { name: "weather", arguments: '{"city":"Paris"}' },
      },
    ]);
    expect(result.completion.choices[0].message.content).toBeNull();
  });

  it("should reject plaintext, tools, log probabilities, and unknown encrypted content fields", () => {
    const recipient = generateVeniceKeyPair();
    const options = {
      privateKey: recipient.privateKey,
      maxPlaintextBytes: 1024,
    };
    const invalidChunks = [
      contentChunk("plaintext", "stop"),
      {
        id: "completion",
        model: "model",
        choices: [
          { index: 0, delta: { tool_calls: [] }, finish_reason: "stop" },
        ],
      },
      {
        id: "completion",
        model: "model",
        choices: [
          { index: 0, delta: { refusal: "plaintext" }, finish_reason: "stop" },
        ],
      },
      {
        id: "completion",
        model: "model",
        choices: [
          {
            index: 0,
            delta: { audio: { data: "plaintext" } },
            finish_reason: "stop",
          },
        ],
      },
      {
        id: "completion",
        model: "model",
        choices: [
          {
            index: 0,
            delta: {},
            logprobs: { content: ["plaintext"] },
            finish_reason: "stop",
          },
        ],
      },
      { ...contentChunk("", "stop"), hidden_content: "plaintext" },
      {
        ...contentChunk("", "stop"),
        usage: { unencrypted_tokens: "plaintext" },
      },
    ];
    for (const chunk of invalidChunks) {
      expect(() => parseVeniceStream(streamBytes([chunk]), options)).toThrow();
    }
  });

  it("should reject in-band errors, missing termination, changed identities, and extra choices", () => {
    const options = { maxPlaintextBytes: 1024 };
    for (const payload of [
      streamBytes([{ error: { message: "provider-secret" } }]),
      streamBytes([contentChunk("unfinished")]),
      streamBytes([contentChunk("missing done", "stop")], false),
      streamBytes([
        contentChunk("a"),
        { ...contentChunk("b", "stop"), id: "different" },
      ]),
      streamBytes([
        contentChunk("a"),
        { ...contentChunk("b", "stop"), model: "different" },
      ]),
      streamBytes([
        {
          id: "completion",
          model: "model",
          choices: [
            { index: 1, delta: { content: "a" }, finish_reason: "stop" },
          ],
        },
      ]),
      new TextEncoder().encode("data: {invalid}\n\ndata: [DONE]\n\n"),
      new TextEncoder().encode("event: error\ndata: {}\n\n"),
      new Uint8Array([255, 10, 10]),
      new TextEncoder().encode(
        new TextDecoder()
          .decode(streamBytes([contentChunk("a", "stop")]))
          .trim(),
      ),
    ]) {
      expect(() => parseVeniceStream(payload, options)).toThrow();
    }
    try {
      parseVeniceStream(
        streamBytes([{ error: { message: "provider-secret" } }]),
        options,
      );
    } catch (error) {
      expect(String(error)).not.toContain("provider-secret");
    }
  });

  it("should enforce decoded UTF-8 and tool argument budgets", () => {
    expect(() =>
      parseVeniceStream(streamBytes([contentChunk("世界", "stop")]), {
        maxPlaintextBytes: 5,
      }),
    ).toThrow("resource limit");
    const recipient = generateVeniceKeyPair();
    expect(() =>
      parseVeniceStream(
        streamBytes([
          contentChunk(
            encryptVeniceMessage("世界", recipient.publicKey),
            "stop",
          ),
        ]),
        {
          privateKey: recipient.privateKey,
          maxPlaintextBytes: 5,
        },
      ),
    ).toThrow("resource limit");
    const payload = streamBytes([
      {
        id: "completion",
        model: "model",
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call",
                  function: { name: "read", arguments: '{"secret":"value"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
    ]);
    expect(() => parseVeniceStream(payload, { maxPlaintextBytes: 5 })).toThrow(
      "resource limit",
    );
  });

  it("should reject malformed or inconsistent TEE tool completions", () => {
    for (const tool of [
      { index: 1, id: "call", function: { name: "tool", arguments: "{}" } },
      { index: 0, function: { name: "tool", arguments: "{}" } },
      {
        index: 0,
        id: "call",
        function: { name: "tool", arguments: "{invalid}" },
      },
    ]) {
      expect(() =>
        parseVeniceStream(
          streamBytes([
            {
              id: "completion",
              model: "model",
              choices: [
                {
                  index: 0,
                  delta: { tool_calls: [tool] },
                  finish_reason: "tool_calls",
                },
              ],
            },
          ]),
          { maxPlaintextBytes: 1024 },
        ),
      ).toThrow();
    }
  });
});
