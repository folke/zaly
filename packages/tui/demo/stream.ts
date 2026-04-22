import { box, createRenderer, markdown, progress, signal, spinner, text } from "../src/index.ts"

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

The \`DECSTBM\` scroll region pins the footer; everything above flows naturally.
`,

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
gets syntax-highlighted in-place.
`,

  `### Inline image in markdown

Here's a screenshot the agent attached:

![your wallpaper](/home/folke/.config/wall.png)

The markdown renderer pre-renders \`![](…)\` refs and splices the image's
\`Image\` node rows into the output. Block images (on their own line)
work best.
`,

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

That's enough for the first agent demo. Let's wire input next.
`,
]

const renderer = createRenderer()

const [status, setStatus] = signal("streaming")
const [progressValue, setProgressValue] = signal(0)
const [spinning, setSpinning] = signal(true)

renderer.ui.add(
  box(
    { bg: "bg", flexDirection: "column", padding: [0, 1] },
    box(
      { flexDirection: "row", gap: 1 },
      spinner({ color: "accent", running: spinning }),
      text(
        ({ style }) =>
          `${style.primary("zaly")} ${style.dim("·")} ${style.success(status())} ${style.dim("·")} ${style.muted("ctrl-c to quit")}`
      )
    ),
    progress({ color: "primary", label: "auto", total: 1, value: progressValue })
  )
)

renderer.start()

async function main(): Promise<void> {
  for (let i = 0; i < responses.length; i++) {
    setStatus(`streaming ${i + 1}/${responses.length}`)
    const node = markdown("", { wrap: "word" })
    renderer.stream.append(node)
    const full = responses[i]
    let j = 0
    while (j < full.length) {
      const take = 1 + Math.floor(Math.random() * 10)
      j = Math.min(j + take, full.length)
      node.state.content = full.slice(0, j)
      setProgressValue((i + j / full.length) / responses.length)
      // oxlint-disable-next-line no-await-in-loop -- streaming is the point.
      await new Promise((r) => setTimeout(r, 12 + Math.floor(Math.random() * 20)))
    }
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 350))
  }

  setStatus("done")
  setProgressValue(1)
  setSpinning(false)
  await new Promise((r) => setTimeout(r, 5000))

  renderer.stop()
}

void main()
