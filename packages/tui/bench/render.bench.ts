/**
 * Render/layout microbench.
 *
 *     bun bench/render.bench.ts
 *
 * Covers the per-frame hot path: building a RenderCtx, walking a node tree,
 * laying out flex children, wrapping text, and hitting the node cache on
 * re-render. Each `bench` block isolates one axis — compare the numbers to
 * decide where to focus.
 */

import { barplot, bench, summary } from "mitata"
import { createCtx } from "../src/core/ctx.ts"
import { defaultTheme } from "../src/themes/registry.ts"
import { box, text } from "../src/widgets/index.ts"

const ctx = createCtx({ theme: defaultTheme, width: 80 })

// Shared fixtures — reused across bench invocations so allocation cost of
// building the tree doesn't show up in the render numbers.
const leaf = text("hello world", { fg: "primary" })

const smallTree = box(
  { border: "rounded", padding: 1 },
  text("title", { bold: true, fg: "primary" }),
  text("body line 1"),
  text("body line 2")
)

const flexRow = box(
  { flexDirection: "row", gap: 2 },
  text("left", { flexGrow: 1 }),
  text("center", { flexGrow: 1 }),
  text("right", { flexGrow: 1 })
)

const deepTree = box(
  { border: "rounded", padding: 1 },
  ...Array.from({ length: 20 }, (_, i) =>
    box(
      { flexDirection: "row", gap: 1 },
      text(`label ${i}`, { fg: "muted", width: 10 }),
      text(`value ${i}`, { fg: "primary", flexGrow: 1 })
    )
  )
)

const longProse =
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat"
const wrapText = text(longProse, { fg: "primary" })

// Styled content with inner SGR — simulates shiki-highlighted tokens.
const styledContent = Array.from(
  { length: 10 },
  () => `\x1b[38;2;130;170;255mkey\x1b[0m: \x1b[38;2;195;232;141m"value"\x1b[0m,`
).join(" ")
const shikiLike = text(styledContent)

barplot(async () => {
  summary(async () => {
    // Baseline: ctx construction cost on its own.
    bench("createCtx()", () => createCtx({ theme: defaultTheme, width: 80 }))

    // Single leaf text, cold cache every time (bump version).
    bench("text leaf (cold)", async () => {
      await leaf.render({ ...ctx, version: Math.random() })
    })

    // Single leaf text, warm cache (version match → no _render).
    bench("text leaf (warm)", async () => {
      await leaf.render(ctx)
    })

    // Small tree cold render.
    bench("small tree (cold)", async () => {
      await smallTree.render({ ...ctx, version: Math.random() })
    })

    // Small tree warm — exercises the version-check path through a border+pad.
    bench("small tree (warm)", async () => {
      await smallTree.render(ctx)
    })

    // Flex row allocation + zip.
    bench("flex row (cold)", async () => {
      await flexRow.render({ ...ctx, version: Math.random() })
    })

    // 20-row deep flex tree — realistic "stats panel" shape.
    bench("deep tree 20x (cold)", async () => {
      await deepTree.render({ ...ctx, version: Math.random() })
    })

    bench("deep tree 20x (warm)", async () => {
      await deepTree.render(ctx)
    })

    // Word-wrap over long prose.
    bench("text wrap long prose", async () => {
      await wrapText.render({ ...ctx, version: Math.random() })
    })

    // Content with inner SGR — exercises splitAnsi + reapplyStyle.
    bench("text w/ inner SGR", async () => {
      await shikiLike.render({ ...ctx, version: Math.random() })
    })
  })
})
