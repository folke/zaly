import {
  box,
  createRenderer,
  markdown,
  overlay,
  progress,
  signal,
  spinner,
  text,
} from "../src/index.ts"

/**
 * Overlay demo. Streams markdown into the scroll region while a help
 * overlay stays pinned and toasts flash over it. Demonstrates that the
 * three surfaces (stream, ui, overlay) compose cleanly — scrollback
 * stays clean, overlays don't block stream growth.
 *
 * Controls:
 *   h        toggle the help overlay
 *   t        open a "toast" overlay that auto-closes after ~2s
 *   ctrl-c   quit  (default binding)
 */

const renderer = createRenderer()

const [status, setStatus] = signal("ready")
const [progressValue, setProgressValue] = signal(0)
const [spinning, setSpinning] = signal(true)

renderer.ui.add(
  box(
    { style: "ui", flexDirection: "column", padding: [0, 1] },
    box(
      { flexDirection: "row", gap: 1 },
      spinner({ color: "accent", running: spinning }),
      text(
        ({ style }) =>
          `${style.primary("zaly")} ${style.dim("·")} ${style.success(status())} ${style.dim("·")} ${style.muted("h help · t toast · ctrl-c quit")}`
      )
    ),
    progress({ color: "primary", label: "auto", total: 1, value: progressValue })
  )
)

// Pre-built help panel. `renderer.overlay.open/close` toggles it.
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

function showToast(message: string): void {
  const t = overlay(
    {
      bg: "success-700",
      fg: "overlay",
      padding: [0, 1],
      width: message.length + 4,
      x: 60,
      y: 2,
      zIndex: 20,
    },
    text(({ style }) => style.bold(message), { wrap: "none" })
  )
  renderer.overlay.open(t)
  setTimeout(() => t.close(), 1800).unref()
}

renderer.bind("h", () => {
  if (helpPanel.mounted) helpPanel.close()
  else renderer.overlay.open(helpPanel)
  return true
})
renderer.bind("t", () => {
  showToast("toast · overlay over stream")
  return true
})

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

renderer.start()
renderer.overlay.open(helpPanel)
showToast("hi! overlays are up")

async function main(): Promise<void> {
  for (let i = 0; i < responses.length; i++) {
    setStatus(`streaming ${i + 1}/${responses.length}`)
    const node = markdown("", { wrap: "word" })
    renderer.stream.append(node)
    const full = responses[i]
    let j = 0
    while (j < full.length) {
      const take = 1 + Math.floor(Math.random() * 8)
      j = Math.min(j + take, full.length)
      node.state.content = full.slice(0, j)
      setProgressValue((i + j / full.length) / responses.length)
      await new Promise((r) => setTimeout(r, 12 + Math.floor(Math.random() * 20)))
    }
    await new Promise((r) => setTimeout(r, 400))
  }

  setStatus("done")
  setProgressValue(1)
  showToast("done — ctrl-c to quit")
  await new Promise((r) => setTimeout(r, 8000))
  setSpinning(false)

  renderer.stop()
}

void main()
