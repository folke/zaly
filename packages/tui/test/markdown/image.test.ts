import { stringWidth, stripAnsi } from "@zaly/shared/ansi"
import { expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { createImageCallback } from "../../src/markdown/image.ts"
import { Image } from "../../src/widgets/image.ts"

function images(...rows: string[][]) {
  const host = { add: vi.fn(), images: new Map<string, Image>(), remove: vi.fn() }
  const callback = createImageCallback(host)
  const markers = rows.map((output, index) => {
    const src = `image-${index}.png`
    const child = new Image({ src })
    vi.spyOn(child, "render").mockResolvedValue(output)
    host.images.set(`${src}\u00000`, child)
    return callback.cb!("fallback", { src })
  })
  return { ...callback, markers }
}

test("inline images share a top-aligned band at terminal-cell columns", async () => {
  const image = images(["AA", "aa", "aa"], ["BBB", "bbb"])
  const [a, b] = image.markers
  const line = `\x1b[31m界🙂\x1b[0m ${a} + ${b}!`
  const out = await image.resolve(createCtx({ width: 80 }), line)
  expect(out.split("\n").map((row) => stripAnsi(row))).toEqual([
    "界🙂 AA + BBB!",
    "     aa   bbb",
    "     aa",
  ])
})

test("band height is the tallest image rather than the sum of heights", async () => {
  const image = images(["AA", "aa"], ["B", "b", "b", "b"], ["CC"])
  const [a, b, c] = image.markers
  const out = await image.resolve(createCtx(), `x${a}/${b}/${c}y`)
  const rows = out.split("\n")
  expect(rows).toEqual(["xAA/B/CCy", " aa b", "    b", "    b"])
  expect(rows).toHaveLength(4)
})

test("following text starts below the entire band", async () => {
  const image = images(["XX", "xx", "xx"])
  const out = await image.resolve(createCtx(), `a ${image.markers[0]} b\nnext line`)
  expect(out).toBe("a XX b\n  xx\n  xx\nnext line")
})

test("standalone images and single-row fallbacks retain their existing layout", async () => {
  const image = images(["XX", "xx"], ["fallback"])
  const out = await image.resolve(createCtx(), `${image.markers[0]}\nText ${image.markers[1]}.`)
  expect(out).toBe("XX\nxx\nText fallback.")
})

test("continuation columns account for ANSI-styled image rows", async () => {
  const image = images(["\x1b[32mAA\x1b[0m", "\x1b[32maa\x1b[0m"], ["B", "b"])
  const out = await image.resolve(createCtx(), `${image.markers[0]}--${image.markers[1]}`)
  const rows = out.split("\n")
  expect(rows.map((row) => stripAnsi(row))).toEqual(["AA--B", "aa  b"])
  expect(rows.map((row) => stringWidth(row))).toEqual([5, 5])
})
