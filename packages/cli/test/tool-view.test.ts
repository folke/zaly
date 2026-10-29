import type { ToolCallPart } from "@zaly/ai"

import { createRoot, memo, signal } from "@zaly/tui"
import { afterEach, expect, test, vi } from "vitest"
import { ToolView } from "../src/widgets/tool.ts"

const ai = await import("@zaly/ai")
const views: ToolView[] = []
afterEach(() => {
  for (const tool of views.splice(0)) tool.close()
  vi.restoreAllMocks()
})

const call = (params: unknown): ToolCallPart => ({
  type: "tool-call",
  id: "call",
  name: "write",
  params,
})
function view(params: unknown) {
  const value = new ToolView({ call: call(params), cwd: process.cwd() })
  views.push(value)
  return value
}
async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 10))
}

test("object params and descriptions are memoized and update synchronously", () => {
  const tool = view({ path: "one.py", description: "First" })
  const params = tool.params
  expect(tool.params).toBe(params)
  expect(params).toEqual({ path: "one.py" })
  expect(tool.desc).toBe("First")
  tool.call = call({ path: "two.py", description: 123 })
  expect(tool.params).toEqual({ path: "two.py" })
  expect(tool.params).not.toBe(params)
  expect(tool.desc).toBe("")
})

test.each([[], 1, true, undefined, "null", '"text"', "[]"].map((params) => ({ params })))(
  "invalid params $params keep the previous preview",
  async ({ params }) => {
    const tool = view({ path: "keep.py" })
    tool.call = call(params)
    await tick()
    expect(tool.params).toEqual({ path: "keep.py" })
  }
)

test("pending is caller-controlled presentation state, independent of results and collapse", () => {
  const batch = signal(true)
  const pending = memo(() => batch.get())
  const first = new ToolView({ call: call({ path: "one.py" }), cwd: process.cwd(), pending })
  const second = new ToolView({ call: call({ path: "two.py" }), cwd: process.cwd(), pending })
  views.push(first, second)
  expect(first.pending).toBe(true)
  expect(second.pending).toBe(true)
  expect(first.collapsed).toBe(false)
  first.result = { content: "done" }
  expect(first.pending).toBe(true)
  expect(first.collapsed).toBe(false)
  expect(second.pending).toBe(true)
  batch.set(false)
  expect(first.pending).toBe(false)
  expect(second.pending).toBe(false)
})

test("close freezes params/results and rejects outstanding repairs without clearing the preview", async () => {
  const tool = view({ path: "keep.py" })
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof ai.parseJson>>>()
  vi.spyOn(ai, "parseJson").mockImplementationOnce(() => pending.promise)
  tool.call = call('{"path":"late.py"')
  tool.close()
  tool.close()
  pending.resolve({ success: true, repaired: true, data: { path: "late.py" } })
  tool.call = call({ path: "new.py" })
  tool.result = { content: "late result" }
  await tick()
  expect(tool.params).toEqual({ path: "keep.py" })
  expect(tool.result).toBeUndefined()
  expect(tool.pending).toBe(false)
})

test("a scheduled throttled repair does no work after close", async () => {
  const parse = vi.spyOn(ai, "parseJson")
  const tool = view('{"path":"first.py"')
  tool.call = call('{"path":"later.py"')
  tool.close()
  const count = parse.mock.calls.length
  await new Promise((resolve) => setTimeout(resolve, 120))
  expect(parse.mock.calls).toHaveLength(count)
})

test("widget owner disposal closes the associated view", async () => {
  const { toolCall } = await import("../src/widgets/tool.ts")
  let tool: ToolView | undefined
  let dispose: () => void = () => {}
  createRoot((cleanup) => {
    dispose = cleanup
    tool = view({ path: "owned.py" })
    toolCall(tool)
  })
  dispose()
  tool!.call = call({ path: "ignored.py" })
  expect(tool!.params).toEqual({ path: "owned.py" })
})

test("call names remain fixed after construction", () => {
  const tool = view({ path: "file.py" })
  expect(() => {
    tool.call = { ...call({}), name: "bash" }
  }).toThrow(/name mismatch/)
})
