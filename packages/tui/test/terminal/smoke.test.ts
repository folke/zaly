import { describe, expect, test } from "bun:test"
import { text } from "../../src/widgets/text.ts"
import { makeHarness } from "./harness.ts"

describe("harness smoke", () => {
  test("stream.append renders a single node into the viewport", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    h.renderer.stream.add(text("hello"))
    await h.flush()
    expect(h.row(h.renderer.terminal.rows - 1)).toBe("hello")
    h.dispose()
  })
})
