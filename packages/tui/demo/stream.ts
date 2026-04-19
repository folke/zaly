import { box, createRenderer, markdown, progress, spinner, text } from "../src/index.ts"

/**
 * Simulates an agent streaming markdown responses into the stream
 * surface. Each response is a `markdown()` node whose `content` grows
 * token-by-token; the node re-renders on every mutation, so fenced
 * blocks become syntax-highlighted, lists reformat, etc. as the text
 * arrives. Earlier responses scroll naturally into history.
 */

const responses = [
  `### Direct-mode rendering — first impressions

After reading the design doc I'm convinced the **direct-mode** approach is right.
Writing whole rows to stdout means the terminal's own scrollback keeps the
history; we don't have to reinvent it.

The \`DECSTBM\` scroll region pins the footer; everything above flows naturally.`,

  `### A small TypeScript example

\`\`\`ts
import { createRenderer, markdown } from "@zaly/tui"

const r = createRenderer()
r.start()

const node = markdown("")
r.stream.append(node)

for await (const chunk of agent.stream()) {
  node.state.content += chunk   // triggers re-render
}
\`\`\`

Because \`markdown()\` re-renders on every mutation, the fenced block above
gets syntax-highlighted in-place.`,

  `### What the surfaces do

| surface   | lives in         | scrolls? | typical use          |
|-----------|------------------|----------|----------------------|
| \`stream\`  | scroll region    | yes      | agent output, logs   |
| \`ui\`      | reserved bottom  | no       | input, status chrome |
| \`overlay\` | full viewport    | no       | modals, palettes     |

A quick list:

- **Growth** is emitted as \`\\n\` at \`scrollBottom\` — pushes old content up naturally.
- **Re-renders** are coalesced via microtask so a 60-token/s stream yields one flush per tick.
- **Synchronized output** (\`CSI ? 2026\`) hides per-flush flicker on every supporting terminal.

That's enough for the first agent demo. Let's wire input next.`,
]

const renderer = createRenderer()
renderer.start()

// Colorful footer: live spinner, status line, and a progress bar that
// tracks overall completion across all responses.
let status = "streaming"
const spin = spinner({ color: "accent" })
const statusLine = text(
  ({ style }) =>
    `${style.primary("zaly")} ${style.dim("·")} ${style.ok(status)} ${style.dim("·")} ${style.muted("ctrl-c to quit")}`,
)
const bar = progress({ color: "primary", label: "auto", total: 1, value: 0 })

renderer.ui.root.add(
  box(
    { bg: "bg", flexDirection: "column", padding: [0, 1] },
    box({ flexDirection: "row", gap: 1 }, spin, statusLine),
    bar,
  ),
)

// Stream one markdown response token-by-token. The same node keeps
// growing; the markdown layer re-renders each flush. `onProgress`
// receives the completion fraction of the individual response so the
// caller can update the footer's shared progress bar.
async function streamMarkdown(full: string, onProgress: (f: number) => void): Promise<void> {
  const node = markdown("", { wrap: "word" })
  renderer.stream.append(node)

  let i = 0
  while (i < full.length) {
    const take = 1 + Math.floor(Math.random() * 5)
    i = Math.min(i + take, full.length)
    node.state.content = full.slice(0, i)
    onProgress(i / full.length)
    // eslint-disable-next-line no-await-in-loop -- streaming is the point.
    await new Promise((r) => setTimeout(r, 12 + Math.floor(Math.random() * 20)))
  }
}

async function main(): Promise<void> {
  /* eslint-disable no-await-in-loop -- sequential is the point. */
  for (let i = 0; i < responses.length; i++) {
    status = `streaming ${i + 1}/${responses.length}`
    statusLine.invalidate()
    await streamMarkdown(responses[i], (f) => {
      bar.state.value = (i + f) / responses.length
    })
    await new Promise((r) => setTimeout(r, 350))
  }
  /* eslint-enable no-await-in-loop */

  status = "done"
  statusLine.invalidate()
  bar.state.value = 1
  spin.stop()
  await new Promise((r) => setTimeout(r, 500))

  renderer.stop()
}

void main()
