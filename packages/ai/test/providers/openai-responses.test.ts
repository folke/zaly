import type { Content } from "../../src/types.ts"

import { expect, test } from "vitest"
import { builtinOverrides } from "../../src/models/overrides.ts"
import { collect } from "../../src/provider.ts"
import { createOpenAIResponses } from "../../src/providers/openai-responses.ts"
import { recordFetch, sseResponse, streamReq } from "../helpers/sse.ts"

async function reasoningStream(events: Record<string, unknown>[]) {
  const { fetch } = recordFetch(sseResponse(events))
  const provider = createOpenAIResponses({ apiKey: "test", fetch })
  const deltas: string[] = []
  const { message } = await collect(
    provider.stream(streamReq({ model: "test", messages: [{ role: "user", content: "Think" }] })),
    {
      onEvent(event) {
        if (event.type === "reasoning-delta") deltas.push(event.delta)
      },
    }
  )
  return { deltas, content: message.content }
}

const summaryDelta = (delta: string, fields: Record<string, unknown> = {}) => ({
  type: "response.reasoning_summary_text.delta",
  delta,
  ...fields,
})

test("Responses separates summary parts in live deltas and saved reasoning", async () => {
  const first = { item_id: "rs_1", summary_index: 0 }
  const second = { item_id: "rs_1", summary_index: 1 }
  const { deltas, content } = await reasoningStream([
    { type: "response.output_item.added", item: { id: "rs_1", type: "reasoning" } },
    { type: "response.reasoning_summary_part.added", ...first },
    summaryDelta("**Preparing ", first),
    summaryDelta("fixtures**", first),
    { type: "response.reasoning_summary_text.done", text: "**Preparing fixtures**", ...first },
    { type: "response.reasoning_summary_part.done", ...first },
    { type: "response.reasoning_summary_part.added", ...second },
    summaryDelta("", second),
    summaryDelta("**Reading ", second),
    summaryDelta("README**", second),
    {
      type: "response.output_item.done",
      item: { type: "reasoning", encrypted_content: "encrypted" },
    },
  ])
  expect(deltas).toEqual(["**Preparing ", "fixtures**", "\n**Reading ", "README**", ""])
  const saved = JSON.stringify(content)
  expect(JSON.parse(saved)).toEqual([
    {
      type: "reasoning",
      text: "**Preparing fixtures**\n**Reading README**",
      signature: "encrypted",
    },
  ])
})

test.each([
  {
    name: "summary indices",
    first: { item_id: "rs_1", summary_index: 0 },
    second: { item_id: "rs_1", summary_index: 1 },
  },
  {
    name: "item ids",
    first: { item_id: "rs_1", summary_index: 0 },
    second: { item_id: "rs_2", summary_index: 0 },
  },
  {
    name: "output indices",
    first: { output_index: 0, summary_index: 0 },
    second: { output_index: 1, summary_index: 0 },
  },
])(
  "Responses detects boundaries from $name without part-added events",
  async ({ first, second }) => {
    const { deltas } = await reasoningStream([
      summaryDelta("First ", first),
      summaryDelta("part", first),
      summaryDelta("Next ", second),
      summaryDelta("part", second),
    ])
    expect(deltas).toEqual(["First ", "part", "\nNext ", "part"])
  }
)

test("Responses part-added events handle missing indices and skip empty parts", async () => {
  const { deltas } = await reasoningStream([
    { type: "response.reasoning_summary_part.added" },
    summaryDelta(""),
    { type: "response.reasoning_summary_part.added" },
    summaryDelta("First"),
    { type: "response.reasoning_summary_part.added" },
    summaryDelta(""),
    { type: "response.reasoning_summary_part.added" },
    summaryDelta("Next"),
  ])
  expect(deltas).toEqual(["First", "\nNext"])
})

test("Responses separates raw reasoning parts without splitting tokens", async () => {
  const { deltas } = await reasoningStream([
    { type: "response.reasoning_text.delta", item_id: "rs_1", content_index: 0, delta: "First " },
    { type: "response.reasoning_text.delta", item_id: "rs_1", content_index: 0, delta: "part" },
    { type: "response.reasoning_text.delta", item_id: "rs_1", content_index: 1, delta: "Next" },
  ])
  expect(deltas).toEqual(["First ", "part", "\nNext"])
})

test("Responses starts new reasoning bubbles without leading separators after text or tools", async () => {
  const { deltas } = await reasoningStream([
    summaryDelta("First", { item_id: "rs_1", summary_index: 3 }),
    { type: "response.output_text.delta", delta: "Reply" },
    summaryDelta("Second", { item_id: "rs_2", summary_index: 0 }),
    {
      type: "response.output_item.added",
      item: { type: "function_call", id: "fc_1", call_id: "read_1", name: "read" },
    },
    { type: "response.function_call_arguments.done", item_id: "fc_1", arguments: "{}" },
    summaryDelta("Third", { item_id: "rs_3", summary_index: 0 }),
  ])
  expect(deltas).toEqual(["First", "Second", "Third"])
})

test("Responses separates reasoning items when delta ids are omitted", async () => {
  const { deltas } = await reasoningStream([
    { type: "response.output_item.added", item: { type: "reasoning", id: "rs_1" } },
    summaryDelta("First"),
    { type: "response.output_item.added", item: { type: "reasoning", id: "rs_2" } },
    summaryDelta("Next"),
  ])
  expect(deltas).toEqual(["First", "\nNext"])
})

async function toolOutput(content: Content, isError = false) {
  const { fetch, recorded } = recordFetch(sseResponse([]))
  const provider = createOpenAIResponses({ apiKey: "test", fetch })
  for await (const _ of provider.stream(
    streamReq({
      model: "test",
      messages: [
        {
          role: "tool",
          content: [{ type: "tool-result", id: "read-1", name: "read", content, isError }],
        },
      ],
    })
  )) {
    // Drain the stream to capture the serialized request.
  }
  return (recorded[0].body as { input: unknown[] }).input
}

async function cachedRequest(opts: { caching?: boolean; codex?: boolean } = {}) {
  const { fetch, recorded } = recordFetch(sseResponse([]))
  const provider = createOpenAIResponses({ apiKey: "test", fetch })
  const req = streamReq({
    caching: opts.caching,
    messages: [{ content: "hello", role: "user" }],
    model: "test",
  })
  ;(req.ctx as { cacheKey?: string }).cacheKey = "session-123"
  if (opts.codex) {
    req.model.provider.id = "openai-codex"
    req.model.provider.quirks = builtinOverrides["openai-codex"]?.quirks
  }
  for await (const _ of provider.stream(req)) {
    // Drain the stream to capture the serialized request.
  }
  return recorded[0]
}

test("Responses sends a stable prompt cache key", async () => {
  const request = await cachedRequest()
  expect(request.body).toMatchObject({ prompt_cache_key: "session-123" })
  expect(request.headers["session-id"]).toBeUndefined()
})

test("Codex supports cache-key-only callers for the session header", async () => {
  const request = await cachedRequest({ codex: true })
  expect(request.body).toMatchObject({ prompt_cache_key: "session-123" })
  expect(request.headers["session-id"]).toBe("session-123")
})

test("Codex retains session routing when cache affinity is disabled", async () => {
  const request = await cachedRequest({ caching: false, codex: true })
  expect(request.body).not.toHaveProperty("prompt_cache_key")
  expect(request.headers["session-id"]).toBe("session-123")
})

test("Responses tool results retain image and PDF attachments", async () => {
  expect(
    await toolOutput([
      { type: "text", text: "Read attachments" },
      {
        type: "image",
        mime: "image/png",
        source: { type: "url", url: "https://example.com/image.png" },
      },
      { type: "pdf", mime: "application/pdf", source: { type: "base64", data: "JVBERi0=" } },
    ])
  ).toEqual([
    {
      type: "function_call_output",
      call_id: "read-1",
      output: [
        { type: "input_text", text: "Read attachments" },
        { type: "input_image", image_url: "https://example.com/image.png" },
        {
          type: "input_file",
          filename: "document.pdf",
          file_data: "data:application/pdf;base64,JVBERi0=",
        },
      ],
    },
  ])
})

test("Responses text-only tool results preserve strings and error prefixes", async () => {
  for (const content of ["failed", [{ type: "text" as const, text: "failed" }]]) {
    expect(await toolOutput(content, true)).toEqual([
      {
        type: "function_call_output",
        call_id: "read-1",
        output: "ERROR: failed",
      },
    ])
  }
})

test("Responses attachment-bearing errors keep their error label", async () => {
  expect(
    await toolOutput(
      [
        {
          type: "image",
          mime: "image/png",
          source: { type: "url", url: "https://example.com/image.png" },
        },
      ],
      true
    )
  ).toEqual([
    {
      type: "function_call_output",
      call_id: "read-1",
      output: [
        { type: "input_text", text: "ERROR:" },
        { type: "input_image", image_url: "https://example.com/image.png" },
      ],
    },
  ])
})
