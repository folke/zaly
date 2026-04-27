import type { RenderMarkdown } from "../src/markdown/index.ts"

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { box, createCtx, markdown } from "../src/index.ts"
import { renderMarkdown as bunRenderer } from "../src/runtime/md.bun.ts"
import { renderMarkdown as markedRenderer } from "../src/runtime/md.node.ts"

const here = dirname(fileURLToPath(import.meta.url))
const earth = resolve(here, "earth.jpg")

// A small fixture exercising the block + inline types our callbacks care
// about. Keep it intentionally varied so rendering quirks show up.
const md = `# Markdown demo

Paragraphs support **bold**, *italic*, ~~strikethrough~~, and \`inline code\`.

## Code

\`\`\`ts title="greeting.ts"
const greeting = "hello"
console.log(greeting)
\`\`\`    

## Blockquote

> A quoted paragraph
> spanning multiple lines.

---

## Lists

- simple item
- nested item
  - level 1 child
  - level 1 sibling
- task list follows
  - [x] shipped
  - [ ] planned

1. [x] shipped
2. [ ] planned

1. first
2. second
3. third

## Table

| col a | col b |
|-------|-------|
| one   | two   |
| three | four  |

Read the [Bun docs](https://bun.com) for details.

## Image

![Apollo 17 — The Blue Marble (NASA, 1972)](${earth})
`.trim()

function column(title: string, render: RenderMarkdown) {
  return box(
    {
      border: "rounded",
      borderTitle: title,
      borderTitleAlign: "center",
      flexGrow: 1,
      padding: [0, 1],
    },
    markdown({ content: md, options: { render } })
  )
}

const app = box(
  { flexDirection: "row", gap: 1 },
  column("Bun.markdown.render", bunRenderer),
  column("renderMarkdown (marked)", markedRenderer)
)

const ctx = createCtx({ width: 200 })
const rendered = await app.render(ctx)

console.log(rendered.join("\n"))
