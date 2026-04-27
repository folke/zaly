import type { Message, Tool } from "../../src/types.ts"

import { describe, expect, test } from "vitest"
import { collect } from "../../src/provider.ts"
import { createOpenAI } from "../../src/providers/openai.ts"
import { recordFetch, sseResponse, streamReq } from "../helpers/sse.ts"

// ── Request translation ──────────────────────────────────────────────────
// We don't export `buildRequest`; assert on the body the adapter actually
// sends to `fetch` — behavioural, not unit.

describe("openai: request translation", () => {
  test("system + user string content", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [
          { content: "be concise", role: "system" },
          { content: "hi", role: "user" },
        ],
        model: "gpt-4o-mini",
      }))
    )

    const body = recorded[0].body as Record<string, unknown>
    expect(body.model).toBe("gpt-4o-mini")
    expect(body.stream).toBe(true)
    expect(body.messages).toEqual([
      { content: "be concise", role: "system" },
      { content: "hi", role: "user" },
    ])
  })

  test("prompt[] is prepended as a single system message, joined with blank lines", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "hi", role: "user" }],
        model: "gpt-4o-mini",
        prompt: ["You are a tutor.", "Always show your work."],
      }))
    )

    const body = recorded[0].body as { messages: unknown[] }
    expect(body.messages[0]).toEqual({
      content: "You are a tutor.\n\nAlways show your work.",
      role: "system",
    })
    expect(body.messages[1]).toEqual({ content: "hi", role: "user" })
  })

  test("prompt[] composes with existing role:'system' messages", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [
          { content: "be concise", role: "system" },
          { content: "hi", role: "user" },
        ],
        model: "gpt-4o-mini",
        prompt: ["You are a tutor."],
      }))
    )

    const body = recorded[0].body as { messages: unknown[] }
    // Durable prompt first, interleaved system second, user last.
    expect(body.messages).toEqual([
      { content: "You are a tutor.", role: "system" },
      { content: "be concise", role: "system" },
      { content: "hi", role: "user" },
    ])
  })

  test("empty prompt[] is a no-op", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "hi", role: "user" }],
        model: "gpt-4o-mini",
        prompt: [],
      }))
    )
    const body = recorded[0].body as { messages: unknown[] }
    expect(body.messages).toEqual([{ content: "hi", role: "user" }])
  })

  test("user message with ImagePart serializes to image_url (base64 → data: URL)", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [
          {
            content: [
              { text: "what is this?", type: "text" },
              {
                detail: "high",
                mime: "image/png",
                source: { data: "iVBORw0K", type: "base64" },
                type: "image",
              },
            ],
            role: "user",
          },
        ],
        model: "gpt-4o-mini",
      }))
    )
    const body = recorded[0].body as { messages: { content: unknown[] }[] }
    expect(body.messages[0].content).toEqual([
      { text: "what is this?", type: "text" },
      {
        image_url: { detail: "high", url: "data:image/png;base64,iVBORw0K" },
        type: "image_url",
      },
    ])
  })

  test("user message with ImagePart (url source) passes the url through", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [
          {
            content: [
              {
                mime: "image/jpeg",
                source: { type: "url", url: "https://example.com/cat.jpg" },
                type: "image",
              },
            ],
            role: "user",
          },
        ],
        model: "gpt-4o-mini",
      }))
    )
    const body = recorded[0].body as { messages: { content: unknown[] }[] }
    expect(body.messages[0].content).toEqual([
      {
        image_url: { url: "https://example.com/cat.jpg" },
        type: "image_url",
      },
    ])
  })

  test("user message with AudioPart serializes to input_audio (mp3)", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [
          {
            content: [
              {
                mime: "audio/mpeg",
                source: { data: "//uQxAA...", type: "base64" },
                type: "audio",
              },
            ],
            role: "user",
          },
        ],
        model: "gpt-4o-audio-preview",
      }))
    )
    const body = recorded[0].body as { messages: { content: unknown[] }[] }
    expect(body.messages[0].content).toEqual([
      { input_audio: { data: "//uQxAA...", format: "mp3" }, type: "input_audio" },
    ])
  })

  test("user message with AudioPart serializes to input_audio (wav)", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [
          {
            content: [
              { mime: "audio/wav", source: { data: "RIFF...", type: "base64" }, type: "audio" },
            ],
            role: "user",
          },
        ],
        model: "gpt-4o-audio-preview",
      }))
    )
    const body = recorded[0].body as { messages: { content: unknown[] }[] }
    expect(body.messages[0].content).toEqual([
      { input_audio: { data: "RIFF...", format: "wav" }, type: "input_audio" },
    ])
  })

  test("AudioPart with URL source throws (not accepted by Chat Completions)", async () => {
    const { fetch } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await expect(
      drain(
        provider.stream(streamReq({
          messages: [
            {
              content: [
                {
                  mime: "audio/mpeg",
                  source: { type: "url", url: "https://example.com/x.mp3" },
                  type: "audio",
                },
              ],
              role: "user",
            },
          ],
          model: "gpt-4o-audio-preview",
        }))
      )
    ).rejects.toThrow(/base64 source/)
  })

  test("user TextPart[] becomes content-parts array", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [
          {
            content: [
              { text: "first ", type: "text" },
              { text: "second", type: "text" },
            ],
            role: "user",
          },
        ],
        model: "gpt-4o-mini",
      }))
    )

    const body = recorded[0].body as { messages: unknown[] }
    expect(body.messages[0]).toEqual({
      content: [
        { text: "first ", type: "text" },
        { text: "second", type: "text" },
      ],
      role: "user",
    })
  })

  test("assistant with interleaved parts flattens text and buckets tool_calls", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    const asst: Message = {
      content: [
        { text: "Let me check.", type: "text" },
        { params: { city: "Tokyo" }, id: "c1", name: "get_weather", type: "tool-call" },
        { text: " And also:", type: "text" },
        { params: { city: "Tokyo" }, id: "c2", name: "get_forecast", type: "tool-call" },
      ],
      role: "assistant",
    }
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "x", role: "user" }, asst, { content: "y", role: "user" }],
        model: "gpt-4o-mini",
      }))
    )

    const body = recorded[0].body as { messages: unknown[] }
    expect(body.messages[1]).toEqual({
      content: "Let me check. And also:",
      role: "assistant",
      tool_calls: [
        {
          function: { arguments: '{"city":"Tokyo"}', name: "get_weather" },
          id: "c1",
          type: "function",
        },
        {
          function: { arguments: '{"city":"Tokyo"}', name: "get_forecast" },
          id: "c2",
          type: "function",
        },
      ],
    })
  })

  test("reasoning parts are dropped on the wire", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [
          { content: "x", role: "user" },
          {
            content: [
              { text: "thinking…", type: "reasoning" },
              { text: "answer", type: "text" },
            ],
            role: "assistant",
          },
        ],
        model: "gpt-4o-mini",
      }))
    )

    const body = recorded[0].body as { messages: unknown[] }
    expect(body.messages[1]).toEqual({ content: "answer", role: "assistant" })
  })

  test("tool role → separate message with tool_call_id", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [
          { content: "x", role: "user" },
          {
            content: [{ params: {}, id: "c1", name: "get_weather", type: "tool-call" }],
            role: "assistant",
          },
          {
            content: [
              { content: '{"temp":18}', id: "c1", name: "get_weather", type: "tool-result" },
            ],
            role: "tool",
          },
        ],
        model: "gpt-4o-mini",
      }))
    )

    const body = recorded[0].body as { messages: unknown[] }
    expect(body.messages[2]).toEqual({
      content: '{"temp":18}',
      role: "tool",
      tool_call_id: "c1",
    })
  })

  test("tool result with attachments spills into a synthetic user message", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [
          { content: "x", role: "user" },
          {
            content: [{ params: {}, id: "c1", name: "shot", type: "tool-call" }],
            role: "assistant",
          },
          {
            content: [
              {
                content: [
                  { text: "screenshot:", type: "text" },
                  {
                    mime: "image/png",
                    source: { data: "iVBORw0K", type: "base64" },
                    type: "image",
                  },
                ],
                id: "c1",
                name: "shot",
                type: "tool-result",
              },
            ],
            role: "tool",
          },
        ],
        model: "gpt-4o-mini",
      }))
    )
    const body = recorded[0].body as { messages: ({ role: string; content: unknown })[] }
    // Tool message: stringified text body + marker; attachments not embedded.
    expect(body.messages[2]).toMatchObject({
      role: "tool",
      tool_call_id: "c1",
    })
    expect(body.messages[2].content).toMatch(/screenshot/)
    expect(body.messages[2].content).toMatch(/attachments delivered/)
    // Synthetic user message right after, carrying the image part.
    expect(body.messages[3]).toEqual({
      content: [
        { image_url: { url: "data:image/png;base64,iVBORw0K" }, type: "image_url" },
      ],
      role: "user",
    })
  })

  test("tools are translated to OpenAI function shape", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    const tool: Tool = {
      desc: "fetch weather",
      call: async () => ({}),
      params: { properties: { city: { type: "string" } }, type: "object" },
      name: "get_weather",
      validateParams: (x) => x,
    }
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "x", role: "user" }],
        model: "gpt-4o-mini",
        tools: [tool],
      }))
    )

    const body = recorded[0].body as { tools?: unknown[] }
    expect(body.tools).toEqual([
      {
        function: {
          description: "fetch weather",
          name: "get_weather",
          parameters: { properties: { city: { type: "string" } }, type: "object" },
        },
        type: "function",
      },
    ])
  })

  test("toolChoice string is translated", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    const tool: Tool = {
      call: async () => ({}),
      params: { type: "object" },
      name: "t",
      validateParams: (x) => x,
    }
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "x", role: "user" }],
        model: "m",
        toolChoice: "required",
        tools: [tool],
      }))
    )
    expect((recorded[0].body as { tool_choice?: unknown }).tool_choice).toBe("required")
  })

  test("toolChoice: { name } becomes function shape", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    const tool: Tool = {
      call: async () => ({}),
      params: { type: "object" },
      name: "t",
      validateParams: (x) => x,
    }
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "x", role: "user" }],
        model: "m",
        toolChoice: { name: "t" },
        tools: [tool],
      }))
    )
    expect((recorded[0].body as { tool_choice?: unknown }).tool_choice).toEqual({
      function: { name: "t" },
      type: "function",
    })
  })

  test("strictTools sets function.strict", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    const tool: Tool = {
      call: async () => ({}),
      params: { type: "object" },
      name: "t",
      validateParams: (x) => x,
    }
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "x", role: "user" }],
        model: "m",
        strictTools: true,
        tools: [tool],
      }))
    )

    const body = recorded[0].body as { tools: [{ function: { strict?: boolean } }] }
    expect(body.tools[0].function.strict).toBe(true)
  })

  test("reasoning.effort translates to reasoning_effort", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "x", role: "user" }],
        model: "gpt-5",
        reasoning: { effort: "high" },
      }))
    )
    expect((recorded[0].body as { reasoning_effort?: unknown }).reasoning_effort).toBe("high")
  })

  test("reasoning.effort: 'off' omits the field", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "x", role: "user" }],
        model: "gpt-5",
        reasoning: { effort: "off" },
      }))
    )
    expect((recorded[0].body as { reasoning_effort?: unknown }).reasoning_effort).toBeUndefined()
  })

  test("reasoning.effort: 'xhigh' collapses to 'high'", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "x", role: "user" }],
        model: "gpt-5",
        reasoning: { effort: "xhigh" },
      }))
    )
    expect((recorded[0].body as { reasoning_effort?: unknown }).reasoning_effort).toBe("high")
  })

  test("responseFormat: 'json' maps to json_object", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "x", role: "user" }],
        model: "m",
        responseFormat: { type: "json" },
      }))
    )
    expect((recorded[0].body as { response_format?: unknown }).response_format).toEqual({
      type: "json_object",
    })
  })

  test("responseFormat: 'json_schema' maps to the full shape", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "x", role: "user" }],
        model: "m",
        responseFormat: {
          name: "Person",
          schema: { properties: { name: { type: "string" } }, type: "object" },
          strict: true,
          type: "json_schema",
        },
      }))
    )
    expect((recorded[0].body as { response_format?: unknown }).response_format).toEqual({
      json_schema: {
        name: "Person",
        schema: { properties: { name: { type: "string" } }, type: "object" },
        strict: true,
      },
      type: "json_schema",
    })
  })

  test("providerOptions.openai passes OpenAI-specific fields through", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        messages: [{ content: "x", role: "user" }],
        model: "m",
        providerOptions: {
          openai: {
            parallelToolCalls: false,
            seed: 42,
            serviceTier: "priority",
            user: "u-123",
          },
        },
      }))
    )
    const body = recorded[0].body as Record<string, unknown>
    expect(body.parallel_tool_calls).toBe(false)
    expect(body.seed).toBe(42)
    expect(body.user).toBe("u-123")
    expect(body.service_tier).toBe("priority")
  })

  test("maxTokens defaults to max_tokens wire field without quirks", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        maxTokens: 123,
        messages: [{ content: "x", role: "user" }],
        model: "m",
      }))
    )
    const body = recorded[0].body as Record<string, unknown>
    expect(body.max_tokens).toBe(123)
    expect(body.max_completion_tokens).toBeUndefined()
  })

  test("quirks.maxTokensField routes maxTokens to max_completion_tokens", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await drain(
      provider.stream(streamReq({
        maxTokens: 123,
        messages: [{ content: "x", role: "user" }],
        model: "gpt-5",
        quirks: { maxTokensField: "max_completion_tokens" },
      }))
    )
    const body = recorded[0].body as Record<string, unknown>
    expect(body.max_completion_tokens).toBe(123)
    expect(body.max_tokens).toBeUndefined()
  })

  test("auth + custom headers are merged", async () => {
    const { fetch, recorded } = recordFetch(sseResponse([finishChunk()]))
    const provider = createOpenAI({
      apiKey: "secret",
      fetch,
      headers: { "X-Stainless": "zaly" },
    })
    await drain(provider.stream(streamReq({ messages: [{ content: "x", role: "user" }], model: "m" })))

    expect(recorded[0].headers.authorization).toBe("Bearer secret")
    expect(recorded[0].headers["x-stainless"]).toBe("zaly")
    expect(recorded[0].headers["content-type"]).toBe("application/json")
  })
})

// ── SSE parsing ──────────────────────────────────────────────────────────

describe("openai: stream parsing", () => {
  test("text deltas are emitted in order", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        chunk({ content: "Hello" }),
        chunk({ content: ", " }),
        chunk({ content: "world" }),
        finishChunk({ finish_reason: "stop" }),
      ])
    )
    const provider = createOpenAI({ apiKey: "test", fetch })
    const events = await drain(
      provider.stream(streamReq({ messages: [{ content: "hi", role: "user" }], model: "m" }))
    )
    const deltas = events
      .filter((e) => e.type === "text-delta")
      .map((e) => (e as { delta: string }).delta)
    expect(deltas).toEqual(["Hello", ", ", "world"])
    const finish = events.find((e) => e.type === "finish")
    expect(finish).toMatchObject({ finishReason: "stop" })
  })

  test("tool call streams are buffered and emitted as one complete event", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        toolStart(0, "call_1", "get_weather"),
        toolArgs(0, '{"c'),
        toolArgs(0, 'ity":'),
        toolArgs(0, '"Tokyo"}'),
        finishChunk({ finish_reason: "tool_calls" }),
      ])
    )
    const provider = createOpenAI({ apiKey: "test", fetch })
    const events = await drain(
      provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" }))
    )
    const calls = events.filter((e) => e.type === "tool-call")
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      params: { city: "Tokyo" },
      id: "call_1",
      name: "get_weather",
      type: "tool-call",
    })
    const finish = events.find((e) => e.type === "finish")
    expect(finish).toMatchObject({ finishReason: "tool-calls" })
  })

  test("multiple tool calls are streamed by index", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        toolStart(0, "c1", "a"),
        toolStart(1, "c2", "b"),
        toolArgs(0, "{}"),
        toolArgs(1, "{}"),
        finishChunk({ finish_reason: "tool_calls" }),
      ])
    )
    const provider = createOpenAI({ apiKey: "test", fetch })
    const events = await drain(
      provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" }))
    )
    const calls = events.filter((e) => e.type === "tool-call")
    expect(calls).toHaveLength(2)
    expect(calls.map((c) => (c as { id: string }).id).toSorted()).toEqual(["c1", "c2"])
  })

  test("malformed tool-call JSON falls back to raw string", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        toolStart(0, "c1", "t"),
        toolArgs(0, "{not valid"),
        finishChunk({ finish_reason: "tool_calls" }),
      ])
    )
    const provider = createOpenAI({ apiKey: "test", fetch })
    const events = await drain(
      provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" }))
    )
    const call = events.find((e) => e.type === "tool-call") as { params: unknown }
    expect(call.params).toBe("{not valid")
  })

  test("usage with cached_tokens maps to cacheRead", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        chunk({ content: "ok" }),
        finishChunk({
          finish_reason: "stop",
          usage: {
            completion_tokens: 7,
            prompt_tokens: 123,
            prompt_tokens_details: { cached_tokens: 80 },
          },
        }),
      ])
    )
    const provider = createOpenAI({ apiKey: "test", fetch })
    const events = await drain(
      provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" }))
    )
    const finish = events.find((e) => e.type === "finish") as {
      usage: { input: number; output: number; cacheRead?: number }
    }
    expect(finish.usage).toEqual({ cacheRead: 80, input: 123, output: 7 })
  })

  test("finish_reason length maps to 'length'", async () => {
    const { fetch } = recordFetch(
      sseResponse([chunk({ content: "x" }), finishChunk({ finish_reason: "length" })])
    )
    const provider = createOpenAI({ apiKey: "test", fetch })
    const events = await drain(
      provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" }))
    )
    expect(events.find((e) => e.type === "finish")).toMatchObject({ finishReason: "length" })
  })

  test("non-ok response throws with status + body", async () => {
    const { fetch } = recordFetch(new Response("no access", { status: 401 }))
    const provider = createOpenAI({ apiKey: "test", fetch })
    await expect(
      drain(provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" })))
    ).rejects.toThrow(/401.*no access/)
  })
})

describe("openai: collect integration", () => {
  test("collect assembles text + tool-call parts in emission order", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        chunk({ content: "Let me " }),
        chunk({ content: "check." }),
        toolStart(0, "c1", "get_weather"),
        toolArgs(0, '{"city":"Tokyo"}'),
        finishChunk({ finish_reason: "tool_calls" }),
      ])
    )
    const provider = createOpenAI({ apiKey: "test", fetch })
    const { finishReason, message } = await collect(
      provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" }))
    )
    expect(finishReason).toBe("tool-calls")
    expect(message.content).toEqual([
      { text: "Let me check.", type: "text" },
      {
        params: { city: "Tokyo" },
        id: "c1",
        name: "get_weather",
        type: "tool-call",
      },
    ])
  })
})

// ── helpers ──────────────────────────────────────────────────────────────

async function drain<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const ev of stream) out.push(ev)
  return out
}

function chunk(delta: Record<string, unknown>) {
  return {
    choices: [{ delta, index: 0 }],
  }
}

function finishChunk(opts: { finish_reason?: string; usage?: Record<string, unknown> } = {}) {
  return {
    choices: [{ delta: {}, finish_reason: opts.finish_reason ?? "stop", index: 0 }],
    usage: opts.usage ?? { completion_tokens: 5, prompt_tokens: 10 },
  }
}

function toolStart(index: number, id: string, name: string) {
  return chunk({
    tool_calls: [{ function: { arguments: "", name }, id, index, type: "function" }],
  })
}

function toolArgs(index: number, args: string) {
  return chunk({
    tool_calls: [{ function: { arguments: args }, index }],
  })
}
