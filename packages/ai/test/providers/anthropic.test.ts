import type { Message, Tool } from "../../src/types.ts"

import { describe, expect, test } from "vitest"
import { collect } from "../../src/provider.ts"
import { createAnthropic } from "../../src/providers/anthropic.ts"
import { recordFetch, sseResponse, streamReq } from "../helpers/sse.ts"

// ── Request translation ──────────────────────────────────────────────────

describe("anthropic: request translation", () => {
  test("mid-conversation system message reframes as user with <system> wrap", async () => {
    // Anthropic rejects mid-conversation system messages outright, and
    // hoisting them to body.system would mix a one-off note with the
    // durable prompt. The adapter converts them to user messages whose
    // content is wrapped in a `<system>` MetaPart, preserving the
    // "system note" signal while staying inside user/assistant alternation.
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          messages: [
            { content: "be concise", role: "system" },
            { content: "hi", role: "user" },
          ],
          model: "claude-sonnet-4-5",
        })
      )
    )

    const body = recorded[0].body as Record<string, unknown>
    expect(body.model).toBe("claude-sonnet-4-5")
    expect(body.stream).toBe(true)
    // No durable prompt → no system slot.
    expect(body.system).toBeUndefined()
    // System note rendered as user message with `<system-reminder>be concise</system-reminder>`,
    // followed by the real user message. Anthropic merges consecutive
    // same-role messages, so both user messages collapse into one.
    expect(body.messages).toEqual([
      {
        content: [
          { text: "<system-reminder>be concise</system-reminder>", type: "text" },
          { text: "hi", type: "text" },
        ],
        role: "user",
      },
    ])
  })

  test("max_tokens defaults when caller omits it", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          messages: [{ content: "hi", role: "user" }],
          model: "m",
        })
      )
    )
    expect((recorded[0].body as { max_tokens: number }).max_tokens).toBe(4096)
  })

  test("max_tokens passed through when set", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          maxTokens: 256,
          messages: [{ content: "hi", role: "user" }],
          model: "m",
        })
      )
    )
    expect((recorded[0].body as { max_tokens: number }).max_tokens).toBe(256)
  })

  test("prompt[] populates the system slot; mid-convo system messages stay in conversation", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          messages: [
            { content: "be concise", role: "system" },
            { content: "hi", role: "user" },
          ],
          model: "m",
          prompt: ["You are a tutor.", "Always show your work."],
        })
      )
    )
    const body = recorded[0].body as { system: unknown; messages: unknown }
    // Only the durable prompt rides in the system slot.
    expect(body.system).toEqual([
      { text: "You are a tutor.", type: "text" },
      { text: "Always show your work.", type: "text" },
    ])
    // The session's `role: "system"` message becomes a wrapped user note.
    expect(body.messages).toEqual([
      {
        content: [
          { text: "<system-reminder>be concise</system-reminder>", type: "text" },
          { text: "hi", type: "text" },
        ],
        role: "user",
      },
    ])
  })

  test("rolling cache marker lands on the last block of the trailing message", async () => {
    // With `caching` on (default), the adapter places `cache_control`
    // on the last content block of the LAST message — the rolling
    // breakpoint that lets every turn hit the previous turn's cache.
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          caching: true,
          messages: [
            { content: "long preamble", role: "system" },
            { content: "hi", role: "user" },
          ],
          model: "m",
        })
      )
    )
    const body = recorded[0].body as { messages: { content: unknown }[]; system?: unknown }
    expect(body.system).toBeUndefined()
    // Wrapped system content + user message coalesce into one `role:
    // "user"` block; the rolling marker sits on its last block ("hi").
    expect(body.messages[0].content).toEqual([
      { text: "<system-reminder>long preamble</system-reminder>", type: "text" },
      { cache_control: { type: "ephemeral" }, text: "hi", type: "text" },
    ])
  })

  test("user message with ImagePart (base64) serializes to an image block", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          messages: [
            {
              content: [
                { text: "what is this?", type: "text" },
                {
                  mime: "image/png",
                  source: { data: "iVBORw0K", type: "base64" },
                  type: "image",
                },
              ],
              role: "user",
            },
          ],
          model: "m",
        })
      )
    )
    const body = recorded[0].body as { messages: { content: unknown[] }[] }
    expect(body.messages[0].content).toEqual([
      { text: "what is this?", type: "text" },
      {
        source: { data: "iVBORw0K", media_type: "image/png", type: "base64" },
        type: "image",
      },
    ])
  })

  test("user message with ImagePart (url) serializes to an image block with url source", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
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
          model: "m",
        })
      )
    )
    const body = recorded[0].body as { messages: { content: unknown[] }[] }
    expect(body.messages[0].content).toEqual([
      { source: { type: "url", url: "https://example.com/cat.jpg" }, type: "image" },
    ])
  })

  test("rolling cache marker lands on a trailing image block", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          caching: true,
          messages: [
            {
              content: [
                {
                  mime: "image/png",
                  source: { data: "iVBORw0K", type: "base64" },
                  type: "image",
                },
              ],
              role: "user",
            },
          ],
          model: "m",
        })
      )
    )
    const body = recorded[0].body as { messages: { content: { cache_control?: unknown }[] }[] }
    expect(body.messages[0].content[0].cache_control).toEqual({ type: "ephemeral" })
  })

  test("tool result with rich content (text + image) serializes as tool_result blocks", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
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
          model: "m",
        })
      )
    )
    const body = recorded[0].body as { messages: { content: unknown[] }[] }
    expect(body.messages[2]).toEqual({
      content: [
        {
          content: [
            { text: "screenshot:", type: "text" },
            {
              source: { data: "iVBORw0K", media_type: "image/png", type: "base64" },
              type: "image",
            },
          ],
          tool_use_id: "c1",
          type: "tool_result",
        },
      ],
      role: "user",
    })
  })

  test("user message with PdfPart (base64) serializes to a document block", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          messages: [
            {
              content: [
                { text: "summarize this", type: "text" },
                {
                  mime: "application/pdf",
                  source: { data: "JVBERi0...", type: "base64" },
                  type: "pdf",
                },
              ],
              role: "user",
            },
          ],
          model: "m",
        })
      )
    )
    const body = recorded[0].body as { messages: { content: unknown[] }[] }
    expect(body.messages[0].content).toEqual([
      { text: "summarize this", type: "text" },
      {
        source: { data: "JVBERi0...", media_type: "application/pdf", type: "base64" },
        type: "document",
      },
    ])
  })

  test("user message with PdfPart (url) serializes to a document block with url source", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          messages: [
            {
              content: [
                {
                  mime: "application/pdf",
                  source: { type: "url", url: "https://example.com/paper.pdf" },
                  type: "pdf",
                },
              ],
              role: "user",
            },
          ],
          model: "m",
        })
      )
    )
    const body = recorded[0].body as { messages: { content: unknown[] }[] }
    expect(body.messages[0].content).toEqual([
      { source: { type: "url", url: "https://example.com/paper.pdf" }, type: "document" },
    ])
  })

  test("rolling cache marker lands on a trailing document block", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          caching: true,
          messages: [
            {
              content: [
                {
                  mime: "application/pdf",
                  source: { data: "JVBERi0...", type: "base64" },
                  type: "pdf",
                },
              ],
              role: "user",
            },
          ],
          model: "m",
        })
      )
    )
    const body = recorded[0].body as { messages: { content: { cache_control?: unknown }[] }[] }
    expect(body.messages[0].content[0].cache_control).toEqual({ type: "ephemeral" })
  })

  test("user TextPart[] becomes text content blocks", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          messages: [
            {
              content: [
                { text: "first ", type: "text" },
                { text: "second", type: "text" },
              ],
              role: "user",
            },
          ],
          model: "m",
        })
      )
    )
    expect((recorded[0].body as { messages: unknown[] }).messages[0]).toEqual({
      content: [
        { text: "first ", type: "text" },
        { text: "second", type: "text" },
      ],
      role: "user",
    })
  })

  test("assistant interleaved parts map to text + tool_use blocks", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    const asst: Message = {
      content: [
        { text: "Let me check.", type: "text" },
        { params: { city: "Tokyo" }, id: "c1", name: "get_weather", type: "tool-call" },
        { text: " And also:", type: "text" },
      ],
      role: "assistant",
    }
    await drain(
      provider.stream(
        streamReq({
          messages: [{ content: "x", role: "user" }, asst, { content: "y", role: "user" }],
          model: "m",
        })
      )
    )
    expect((recorded[0].body as { messages: unknown[] }).messages[1]).toEqual({
      content: [
        { text: "Let me check.", type: "text" },
        { id: "c1", input: { city: "Tokyo" }, name: "get_weather", type: "tool_use" },
        { text: " And also:", type: "text" },
      ],
      role: "assistant",
    })
  })

  test("reasoning parts round-trip as thinking blocks (signature preserved)", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          messages: [
            { content: "x", role: "user" },
            {
              content: [
                { signature: "sig-abc", text: "hmm", type: "reasoning" },
                { text: "answer", type: "text" },
              ],
              role: "assistant",
            },
          ],
          model: "m",
        })
      )
    )
    expect((recorded[0].body as { messages: unknown[] }).messages[1]).toEqual({
      content: [
        { signature: "sig-abc", thinking: "hmm", type: "thinking" },
        { text: "answer", type: "text" },
      ],
      role: "assistant",
    })
  })

  test("tool role becomes user message with tool_result blocks", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
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
          model: "m",
        })
      )
    )
    expect((recorded[0].body as { messages: unknown[] }).messages[2]).toEqual({
      content: [{ content: '{"temp":18}', tool_use_id: "c1", type: "tool_result" }],
      role: "user",
    })
  })

  test("consecutive tool messages coalesce into one user message", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          messages: [
            { content: "x", role: "user" },
            {
              content: [
                { params: {}, id: "c1", name: "a", type: "tool-call" },
                { params: {}, id: "c2", name: "b", type: "tool-call" },
              ],
              role: "assistant",
            },
            {
              content: [{ content: "1", id: "c1", name: "a", type: "tool-result" }],
              role: "tool",
            },
            {
              content: [{ content: "2", id: "c2", name: "b", type: "tool-result" }],
              role: "tool",
            },
          ],
          model: "m",
        })
      )
    )
    const messages = (recorded[0].body as { messages: { role: string; content: unknown[] }[] })
      .messages
    expect(messages).toHaveLength(3)
    expect(messages[2]).toEqual({
      content: [
        { content: "1", tool_use_id: "c1", type: "tool_result" },
        { content: "2", tool_use_id: "c2", type: "tool_result" },
      ],
      role: "user",
    })
  })

  test("isError tool result sets is_error flag", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          messages: [
            { content: "x", role: "user" },
            {
              content: [{ params: {}, id: "c1", name: "t", type: "tool-call" }],
              role: "assistant",
            },
            {
              content: [
                { content: "boom", id: "c1", isError: true, name: "t", type: "tool-result" },
              ],
              role: "tool",
            },
          ],
          model: "m",
        })
      )
    )
    const result = (recorded[0].body as { messages: { content: unknown[] }[] }).messages[2]
      .content[0] as { is_error?: boolean }
    expect(result.is_error).toBe(true)
  })

  test("rolling cache marker lands on the last block of a multi-block trailing message", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          caching: true,
          messages: [
            {
              content: [
                { text: "a", type: "text" },
                { text: "b", type: "text" },
              ],
              role: "user",
            },
          ],
          model: "m",
        })
      )
    )
    expect(
      (recorded[0].body as { messages: { content: unknown[] }[] }).messages[0].content
    ).toEqual([
      { text: "a", type: "text" },
      { cache_control: { type: "ephemeral" }, text: "b", type: "text" },
    ])
  })

  test("caching: false suppresses all cache_control markers on the wire", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    const tool: Tool = {
      desc: "x",
      call: async () => ({}),
      params: { type: "object" },
      name: "t",
      validateParams: (x) => x,
    }
    await drain(
      provider.stream(
        streamReq({
          caching: false,
          messages: [
            { content: "preamble", role: "system" },
            { content: "hi", role: "user" },
          ],
          model: "m",
          tools: [tool],
        })
      )
    )
    const body = recorded[0].body as Record<string, unknown>
    expect(JSON.stringify(body)).not.toContain("cache_control")
  })

  test("tools translate to Anthropic shape", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    const tool: Tool = {
      desc: "fetch weather",
      call: async () => ({}),
      params: { properties: { city: { type: "string" } }, type: "object" },
      name: "get_weather",
      validateParams: (x) => x,
    }
    await drain(
      provider.stream(
        streamReq({
          messages: [{ content: "x", role: "user" }],
          model: "m",
          tools: [tool],
        })
      )
    )
    expect((recorded[0].body as { tools: unknown[] }).tools).toEqual([
      {
        description: "fetch weather",
        input_schema: { properties: { city: { type: "string" } }, type: "object" },
        name: "get_weather",
      },
    ])
  })

  test("toolChoice maps each variant", async () => {
    const cases: {
      input: NonNullable<Parameters<typeof provider.stream>[0]["opts"]["toolChoice"]>
      expected: unknown
    }[] = [
      { expected: { type: "auto" }, input: "auto" },
      { expected: { type: "any" }, input: "required" },
      { expected: { type: "none" }, input: "none" },
      { expected: { name: "t", type: "tool" }, input: { name: "t" } },
    ]
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    const tool: Tool = {
      call: async () => ({}),
      params: { type: "object" },
      name: "t",
      validateParams: (x) => x,
    }
    for (const c of cases) {
      await drain(
        provider.stream(
          streamReq({
            messages: [{ content: "x", role: "user" }],
            model: "m",
            toolChoice: c.input,
            tools: [tool],
          })
        )
      )
    }
    for (const [i, c] of cases.entries()) {
      expect((recorded[i].body as { tool_choice: unknown }).tool_choice).toEqual(c.expected)
    }
  })

  test("reasoning.effort maps to thinking budget_tokens", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          maxTokens: 100_000,
          messages: [{ content: "x", role: "user" }],
          model: "m",
          reasoning: { effort: "high" },
        })
      )
    )
    expect((recorded[0].body as { thinking: unknown }).thinking).toEqual({
      budget_tokens: 16_384,
      type: "enabled",
    })
  })

  test("reasoning.budget overrides effort-derived bucket", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          maxTokens: 100_000,
          messages: [{ content: "x", role: "user" }],
          model: "m",
          reasoning: { budget: 2048, effort: "low" },
        })
      )
    )
    expect(
      (recorded[0].body as { thinking: { budget_tokens: number } }).thinking.budget_tokens
    ).toBe(2048)
  })

  test("reasoning.effort: 'off' omits thinking", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await drain(
      provider.stream(
        streamReq({
          messages: [{ content: "x", role: "user" }],
          model: "m",
          reasoning: { effort: "off" },
        })
      )
    )
    expect((recorded[0].body as { thinking?: unknown }).thinking).toBeUndefined()
  })

  test("auth + version + custom headers are merged", async () => {
    const { fetch, recorded } = recordFetch(sseResponse(basicStream()))
    const provider = createAnthropic({
      apiKey: "secret",
      fetch,
      headers: { "X-Stainless": "zaly" },
    })
    await drain(
      provider.stream(streamReq({ messages: [{ content: "x", role: "user" }], model: "m" }))
    )
    expect(recorded[0].headers["x-api-key"]).toBe("secret")
    expect(recorded[0].headers["anthropic-version"]).toBe("2023-06-01")
    expect(recorded[0].headers["x-stainless"]).toBe("zaly")
    expect(recorded[0].headers["content-type"]).toBe("application/json")
  })
})

// ── SSE parsing ──────────────────────────────────────────────────────────

describe("anthropic: stream parsing", () => {
  test("text deltas are emitted in order; usage rolls up at end", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        messageStart({ input_tokens: 10, output_tokens: 0 }),
        contentBlockStart(0, { text: "", type: "text" }),
        textDelta(0, "Hello"),
        textDelta(0, ", "),
        textDelta(0, "world"),
        contentBlockStop(0),
        messageDelta("end_turn", { output_tokens: 7 }),
        messageStop(),
      ])
    )
    const provider = createAnthropic({ apiKey: "test", fetch })
    const events = await drain(
      provider.stream(streamReq({ messages: [{ content: "hi", role: "user" }], model: "m" }))
    )
    const deltas = events
      .filter((e) => e.type === "text-delta")
      .map((e) => (e as { delta: string }).delta)
    expect(deltas).toEqual(["Hello", ", ", "world"])
    const finish = events.find((e) => e.type === "finish") as {
      finishReason: string
      usage: { input: number; output: number }
    }
    expect(finish.finishReason).toBe("stop")
    expect(finish.usage).toEqual({ input: 10, output: 7 })
  })

  test("cache fields surface on usage", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        messageStart({
          cache_creation_input_tokens: 80,
          cache_read_input_tokens: 200,
          input_tokens: 12,
          output_tokens: 0,
        }),
        contentBlockStart(0, { text: "", type: "text" }),
        textDelta(0, "ok"),
        contentBlockStop(0),
        messageDelta("end_turn", { output_tokens: 3 }),
        messageStop(),
      ])
    )
    const provider = createAnthropic({ apiKey: "test", fetch })
    const events = await drain(
      provider.stream(streamReq({ messages: [{ content: "hi", role: "user" }], model: "m" }))
    )
    const finish = events.find((e) => e.type === "finish") as {
      usage: { input: number; output: number; cacheRead?: number; cacheWrite?: number }
    }
    // `input` is the *uncached* portion (full-rate billing), with
    // `cacheRead` / `cacheWrite` as separate billing tiers. Total
    // prompt = input + cacheRead + cacheWrite. Anthropic reports
    // this shape natively.
    expect(finish.usage).toEqual({ cacheRead: 200, cacheWrite: 80, input: 12, output: 3 })
  })

  test("tool_use accumulates input_json_delta and emits one tool-call", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        messageStart({ input_tokens: 5, output_tokens: 0 }),
        contentBlockStart(0, { id: "tu_1", input: {}, name: "get_weather", type: "tool_use" }),
        inputJsonDelta(0, '{"c'),
        inputJsonDelta(0, 'ity":'),
        inputJsonDelta(0, '"Tokyo"}'),
        contentBlockStop(0),
        messageDelta("tool_use", { output_tokens: 8 }),
        messageStop(),
      ])
    )
    const provider = createAnthropic({ apiKey: "test", fetch })
    const events = await drain(
      provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" }))
    )
    const calls = events.filter((e) => e.type === "tool-call")
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      params: '{"city":"Tokyo"}',
      id: "tu_1",
      name: "get_weather",
      type: "tool-call",
    })
    expect(events.find((e) => e.type === "finish")).toMatchObject({ finishReason: "tool-calls" })
  })

  test("thinking + signature deltas surface as reasoning events", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        messageStart({ input_tokens: 5, output_tokens: 0 }),
        contentBlockStart(0, { thinking: "", type: "thinking" }),
        thinkingDelta(0, "weighing options"),
        signatureDelta(0, "sig-xyz"),
        contentBlockStop(0),
        contentBlockStart(1, { text: "", type: "text" }),
        textDelta(1, "answer"),
        contentBlockStop(1),
        messageDelta("end_turn", { output_tokens: 9 }),
        messageStop(),
      ])
    )
    const provider = createAnthropic({ apiKey: "test", fetch })
    const { message } = await collect(
      provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" }))
    )
    expect(message.content).toEqual([
      { signature: "sig-xyz", text: "weighing options", type: "reasoning" },
      { text: "answer", type: "text" },
    ])
  })

  test("malformed tool-call JSON falls back to raw string", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        messageStart({ input_tokens: 5, output_tokens: 0 }),
        contentBlockStart(0, { id: "tu_1", input: {}, name: "t", type: "tool_use" }),
        inputJsonDelta(0, "{not valid"),
        contentBlockStop(0),
        messageDelta("tool_use", { output_tokens: 1 }),
        messageStop(),
      ])
    )
    const provider = createAnthropic({ apiKey: "test", fetch })
    const events = await drain(
      provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" }))
    )
    const call = events.find((e) => e.type === "tool-call") as { params: unknown }
    expect(call.params).toBe("{not valid")
  })

  test("max_tokens stop reason maps to 'length'", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        messageStart({ input_tokens: 5, output_tokens: 0 }),
        contentBlockStart(0, { text: "", type: "text" }),
        textDelta(0, "x"),
        contentBlockStop(0),
        messageDelta("max_tokens", { output_tokens: 1 }),
        messageStop(),
      ])
    )
    const provider = createAnthropic({ apiKey: "test", fetch })
    const events = await drain(
      provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" }))
    )
    expect(events.find((e) => e.type === "finish")).toMatchObject({ finishReason: "length" })
  })

  test("server-sent error event throws", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        messageStart({ input_tokens: 5, output_tokens: 0 }),
        { error: { message: "server overloaded", type: "overloaded_error" }, type: "error" },
      ])
    )
    const provider = createAnthropic({ apiKey: "test", fetch })
    await expect(
      drain(provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" })))
    ).rejects.toThrow(/overloaded/)
  })

  test("non-ok response throws with status + body", async () => {
    const { fetch } = recordFetch(new Response("nope", { status: 401 }))
    const provider = createAnthropic({ apiKey: "test", fetch })
    await expect(
      drain(provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" })))
    ).rejects.toThrow(/401.*nope/)
  })
})

describe("anthropic: collect integration", () => {
  test("collect assembles text + tool-call parts in emission order", async () => {
    const { fetch } = recordFetch(
      sseResponse([
        messageStart({ input_tokens: 5, output_tokens: 0 }),
        contentBlockStart(0, { text: "", type: "text" }),
        textDelta(0, "Let me "),
        textDelta(0, "check."),
        contentBlockStop(0),
        contentBlockStart(1, { id: "tu_1", input: {}, name: "get_weather", type: "tool_use" }),
        inputJsonDelta(1, '{"city":"Tokyo"}'),
        contentBlockStop(1),
        messageDelta("tool_use", { output_tokens: 12 }),
        messageStop(),
      ])
    )
    const provider = createAnthropic({ apiKey: "test", fetch })
    const { finishReason, message } = await collect(
      provider.stream(streamReq({ messages: [{ content: "q", role: "user" }], model: "m" }))
    )
    expect(finishReason).toBe("tool-calls")
    expect(message.content).toEqual([
      { text: "Let me check.", type: "text" },
      {
        params: '{"city":"Tokyo"}',
        id: "tu_1",
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

function basicStream(): unknown[] {
  return [
    messageStart({ input_tokens: 1, output_tokens: 0 }),
    contentBlockStart(0, { text: "", type: "text" }),
    textDelta(0, "ok"),
    contentBlockStop(0),
    messageDelta("end_turn", { output_tokens: 1 }),
    messageStop(),
  ]
}

interface UsageInit {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

function messageStart(usage: UsageInit) {
  return {
    message: { id: "msg_1", model: "m", usage },
    type: "message_start",
  }
}

function contentBlockStart(index: number, content_block: unknown) {
  return { content_block, index, type: "content_block_start" }
}

function contentBlockStop(index: number) {
  return { index, type: "content_block_stop" }
}

function textDelta(index: number, text: string) {
  return { delta: { text, type: "text_delta" }, index, type: "content_block_delta" }
}

function thinkingDelta(index: number, thinking: string) {
  return { delta: { thinking, type: "thinking_delta" }, index, type: "content_block_delta" }
}

function signatureDelta(index: number, signature: string) {
  return { delta: { signature, type: "signature_delta" }, index, type: "content_block_delta" }
}

function inputJsonDelta(index: number, partial_json: string) {
  return {
    delta: { partial_json, type: "input_json_delta" },
    index,
    type: "content_block_delta",
  }
}

function messageDelta(stop_reason: string, usage: { output_tokens: number }) {
  return {
    delta: { stop_reason },
    type: "message_delta",
    usage,
  }
}

function messageStop() {
  return { type: "message_stop" }
}
