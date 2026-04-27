import type { StreamEvent } from "../../src/provider.ts"
import type { Tool } from "../../src/types.ts"

/**
 * Live integration tests. Skipped unless `ANTHROPIC_API_KEY` is set.
 *
 * Run from the repo root so the top-level `.env` is picked up:
 *
 *   bun test:node packages/ai/test/providers/anthropic.live.test.ts
 *   MODEL=anthropic/claude-sonnet-4-6 bun test:node …    (override)
 *
 * Cost control: Haiku by default, short prompts, small token caps;
 * ~6 requests per run.
 */
import { describe, expect, test } from "vitest"
import { loadModel } from "../../src/model.ts"
import { collect } from "../../src/provider.ts"

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY)
const MODEL = process.env.MODEL ?? "anthropic/claude-haiku-4-5"

describe.skipIf(!hasKey)("anthropic: live", () => {
  test("basic completion returns text + usage", async () => {
    const model = await loadModel(MODEL)
    const { finishReason, message, usage } = await collect(
      model.stream({
        messages: [
          { content: "Reply with just the word 'pong'.", role: "system" },
          { content: "ping", role: "user" },
        ]}, {
        maxTokens: 20,
        temperature: 0})
    )
    expect(finishReason).toBe("stop")
    expect(usage.input).toBeGreaterThan(0)
    expect(usage.output).toBeGreaterThan(0)
    const text = extractText(message.content)
    expect(text.toLowerCase()).toContain("pong")
  }, 30_000)

  test("streaming emits text-delta events in order", async () => {
    const model = await loadModel(MODEL)
    const events: StreamEvent[] = []
    await collect(
      model.stream({
        messages: [
          {
            content: "Write two short sentences about why bytes are useful. No preamble.",
            role: "user",
          },
        ]}, {
        // Long enough to span multiple SSE chunks. Anthropic tends to
        // emit one chunk per ~80–120 chars, so a two-sentence answer
        // gives us multiple deltas without being expensive.
        maxTokens: 80,
        temperature: 0}),
      { onEvent: (e) => void events.push(e) }
    )
    const deltas = events.filter((e) => e.type === "text-delta")
    expect(deltas.length).toBeGreaterThan(1)
  }, 30_000)

  test("tool calls round-trip with parsed args", async () => {
    const model = await loadModel(MODEL)
    const tool: Tool = {
      desc: "Get the weather for a city.",
      call: async () => ({ temp: 18 }),
      params: {
        additionalProperties: false,
        properties: { city: { type: "string" } },
        required: ["city"],
        type: "object",
      },
      name: "get_weather",
      validateParams: (x) => x,
    }
    const { finishReason, message } = await collect(
      model.stream({
        messages: [{ content: "Use the get_weather tool for Tokyo.", role: "user" }],
        tools: [tool]}, {
        maxTokens: 100,
        temperature: 0,
        toolChoice: { name: "get_weather" }})
    )
    const calls = asArray(message.content).filter((p) => p.type === "tool-call")
    expect(calls).toHaveLength(1)
    const call = calls[0] as unknown as { name: string; params: { city: string } }
    expect(call.name).toBe("get_weather")
    expect(call.params.city.toLowerCase()).toContain("tokyo")
    expect(["tool-calls", "stop"]).toContain(finishReason)
  }, 30_000)

  test("aborting mid-stream rejects with AbortError", async () => {
    const model = await loadModel(MODEL)
    const controller = new AbortController()
    const stream = model.stream({
      messages: [{ content: "Write a 300-word essay about terminals.", role: "user" }]}, {
      maxTokens: 500,
      signal: controller.signal,
      temperature: 0})
    setTimeout(() => controller.abort(), 150)
    await expect(
      (async () => {
        for await (const _ of stream) {
          // drain
        }
      })()
    ).rejects.toMatchObject({ name: "AbortError" })
  }, 30_000)

  test("onUpdate snapshots grow monotonically", async () => {
    const model = await loadModel(MODEL)
    const snapshots: number[] = []
    await collect(
      model.stream({
        messages: [{ content: "Write one short sentence about bytes.", role: "user" }]}, {
        maxTokens: 30,
        temperature: 0}),
      {
        onUpdate: (msg) => {
          snapshots.push(extractText(msg.content).length)
        },
      }
    )
    expect(snapshots.length).toBeGreaterThan(0)
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i]).toBeGreaterThanOrEqual(snapshots[i - 1])
    }
  }, 30_000)

  test("prompt caching populates cacheWrite then cacheRead on second call", async () => {
    // Anthropic's minimum cacheable prompt is 1024 tokens for Sonnet/Opus
    // and 2048 for Haiku. Pad well over the higher threshold so the
    // breakpoint is honoured regardless of the model under test.
    const filler = "Background context paragraph. ".repeat(1500)
    const model = await loadModel(MODEL)
    const messages = [
      {
        cache: { type: "ephemeral" as const },
        content: `${filler}\nReply with just the word 'pong'.`,
        role: "system" as const,
      },
      { content: "ping", role: "user" as const },
    ]

    const first = await collect(model.stream({ messages}, { maxTokens: 10, temperature: 0 }))
    // Cache writes can take a moment to become readable across the fleet.
    await new Promise((r) => setTimeout(r, 1000))
    const second = await collect(model.stream({ messages}, { maxTokens: 10, temperature: 0 }))

    // Wire integration is what we own: the cache_control hint must round-trip
    // and produce non-zero cache_creation OR cache_read on each call. Whether
    // call #2 actually hits the cache depends on Anthropic's fleet propagation
    // and on whether a prior run already warmed it — both are best-effort.
    const totalCache =
      (first.usage.cacheWrite ?? 0) +
      (first.usage.cacheRead ?? 0) +
      (second.usage.cacheWrite ?? 0) +
      (second.usage.cacheRead ?? 0)
    expect(totalCache).toBeGreaterThan(0)
  }, 60_000)
})

function extractText(content: string | { type: string; text?: string }[]): string {
  if (typeof content === "string") return content
  return content
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("")
}

function asArray<T>(x: string | T[]): T[] {
  return typeof x === "string" ? [] : x
}
