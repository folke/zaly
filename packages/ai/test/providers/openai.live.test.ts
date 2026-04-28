import type { StreamEvent } from "../../src/provider.ts"
import type { Tool } from "../../src/types.ts"

/**
 * Live integration tests. Opt-in only — skipped unless BOTH:
 *   - `LIVE=1` (or any truthy value) is set, AND
 *   - `OPENAI_API_KEY` is available.
 *
 * The `LIVE` gate exists because the bare `bun test` runner picks these
 * up by filename even though our default `test` script tries to skip
 * them via `--no-env-file`. Without the explicit opt-in, a forgotten
 * env-loaded shell would silently start hitting paid APIs. Run them via
 * `bun test:live` (sets `LIVE=1` for you) or manually:
 *
 *   LIVE=1 bun test:node packages/ai/test/providers/openai.live.test.ts
 *   LIVE=1 MODEL=openai/gpt-5.5-mini bun test:node …    (override)
 *
 * Cost control: short prompts, small token caps; ~5 requests per run.
 */
import { describe, expect, test } from "vitest"
import { loadModel } from "../../src/model.ts"
import { collect } from "../../src/provider.ts"

const enabled = Boolean(process.env.LIVE) && Boolean(process.env.OPENAI_API_KEY)
const MODEL = process.env.MODEL ?? "openai/gpt-4o-mini"

describe.skipIf(!enabled)("openai: live", () => {
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
        messages: [{ content: "Count from 1 to 5, space-separated.", role: "user" }]}, {
        maxTokens: 30,
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
        maxTokens: 60,
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
