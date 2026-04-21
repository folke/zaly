import {
  box,
  createRenderer,
  input,
  markdown,
  overlay,
  progress,
  spinner,
  text,
} from "../src/index.ts"

/**
 * Overlay demo. Streams markdown into the scroll region while a
 * notification overlay appears, updates, moves, then closes — without
 * polluting scrollback and without blocking the stream's own growth.
 *
 * Controls:
 *   h        toggle the help overlay
 *   t        open a "toast" overlay that auto-closes after 2s
 *   ctrl-c   quit
 */

const renderer = createRenderer()

// Footer: spinner + status + progress + input hint.
let status = "ready"
const spin = spinner({ color: "accent" })
const statusLine = text(
  ({ style }) =>
    `${style.primary("zaly")} ${style.dim("·")} ${style.success(status)} ${style.dim("·")} ${style.muted("h help · t toast · ctrl-c quit")}`
)
const bar = progress({ color: "primary", label: "auto", total: 1, value: 0 })

renderer.ui.root.add(
  box(
    { bg: "bg", flexDirection: "column", padding: [0, 1] },
    box({ flexDirection: "row", gap: 1 }, spin, statusLine),
    bar
  )
)

// --- overlays -------------------------------------------------------------

// Pre-built help panel. Opened/closed by the `?` key.
const helpPanel = overlay(
  {
    border: "rounded",
    borderTitle: "help",
    borderTitleAlign: "center",
    padding: [0, 1],
    width: 30,
    x: 2,
    y: 5,
    zIndex: 10,
  },
  text(
    ({ style }) =>
      [
        `${style.accent("h")}       ${style.dim("toggle this panel")}`,
        `${style.accent("t")}       ${style.dim("show a toast (auto-close)")}`,
        `${style.accent("ctrl-c")}  ${style.dim("quit")}`,
      ].join("\n"),
    { wrap: "none" }
  )
)
let helpOpen = false

// Toast: built on demand, auto-closed via `setTimeout`. Demonstrates a
// short-lived overlay that appears over whatever the stream is doing.
function showToast(message: string): void {
  const t = overlay(
    {
      bg: "success-700",
      fg: "fg",
      padding: [0, 1],
      width: message.length + 4,
      x: 60,
      y: 2,
      zIndex: 20,
    },
    text(({ style }) => style.bold(message), { wrap: "none" })
  )
  renderer.overlay.open(t)
  setTimeout(() => renderer.overlay.close(t), 1800).unref()
}

// --- global keys ----------------------------------------------------------

renderer.bind("h", () => {
  helpOpen = !helpOpen
  if (helpOpen) renderer.overlay.open(helpPanel)
  else renderer.overlay.close(helpPanel)
  return true
})
renderer.bind("t", () => {
  showToast("toast · overlay over stream")
  return true
})
renderer.bind("ctrl-c", () => {
  renderer.stop()
  process.exit(0)
  return true
})

// Force ui to be "global" focus target so the bindings fire.
renderer.input.focus(renderer.ui.root as never)

// --- streaming content ----------------------------------------------------

const responses = [
  `### Overlay demo — streaming underneath

This paragraph keeps growing while the overlay above stays pinned at its
absolute position. Try pressing h to toggle help, or t to
flash a toast.`,

  `### Scrollback stays clean

Even as this stream pushes older content up and into the terminal's
scrollback, the overlay's bytes never leak there — the overlay surface
marks the covered rows stale each tick so the stream rewrites the real
content before the next \`\\n\`-at-scrollBottom scroll.`,

  `### One atomic frame

Stream, UI, and overlay all paint inside a single synchronized-output
bracket per tick, so there's no flicker between the three layers even
when the stream is mid-growth and the overlay is repositioning.`,

  `### Final chunk

That's all. The spinner keeps ticking, the progress bar hits 100%, and
you can leave the help open the whole time.`,
]

async function streamMarkdown(full: string, onProgress: (f: number) => void): Promise<void> {
  const node = markdown("", { wrap: "word" })
  renderer.stream.append(node)
  let i = 0
  while (i < full.length) {
    const take = 1 + Math.floor(Math.random() * 8)
    i = Math.min(i + take, full.length)
    node.state.content = full.slice(0, i)
    onProgress(i / full.length)
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 12 + Math.floor(Math.random() * 20)))
  }
}

async function main(): Promise<void> {
  renderer.start()
  // Auto-open the help panel so the demo looks populated from frame 0.
  renderer.overlay.open(helpPanel)
  helpOpen = true
  showToast("hi! overlays are up")

  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < responses.length; i++) {
    status = `streaming ${i + 1}/${responses.length}`
    statusLine.invalidate()
    await streamMarkdown(responses[i], (f) => {
      bar.state.value = (i + f) / responses.length
    })
    await new Promise((r) => setTimeout(r, 400))
  }
  /* eslint-enable no-await-in-loop */

  status = "done"
  statusLine.invalidate()
  bar.state.value = 1
  showToast("done — ctrl-c to quit")
  await new Promise((r) => setTimeout(r, 8000))
  spin.stop()

  renderer.stop()
}

void main()

// Demo is read-only, but input needs to exist for focus/keymap plumbing
// to route globals. Attach an invisible input to the ui root.
void input
