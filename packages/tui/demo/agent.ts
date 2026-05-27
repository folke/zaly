import {
  actionsSource,
  autocomplete,
  box,
  createRenderer,
  filesSource,
  input,
  markdown,
  overlay,
  progress,
  signal,
  spinner,
  text,
} from "@zaly/tui"

/**
 * Agent harness — a compact coding-assistant shell built on @zaly/tui.
 *
 * Exercises most of the toolkit in one place:
 *
 *   - stream surface for conversation history
 *   - sticky footer with status, progress, autocomplete, composer
 *   - actions registry driving slash commands and keymap bindings
 *   - overlay for contextual help + a welcome toast
 *   - signal-driven footer updates, streamed markdown replies
 */

const renderer = await createRenderer()

const [busy, setBusy] = signal(false)
const [status, setStatus] = signal("ready")
const [progressValue, setProgressValue] = signal(0)
const [model] = signal("claude-opus-ish")

const composer = input({
  placeholder: "Ask me to review an API, sketch a plan, or open a file…",
}).focus()

// ── Help overlay ─────────────────────────────────────────────────────
// Auto-built from the action catalog so it stays in sync as you add
// actions. Stays closed until the user opens it via `/help` or ctrl-h.

const help = overlay(
  {
    border: "rounded",
    borderTitle: "help",
    borderTitleAlign: "center",
    padding: [0, 1],
    width: 48,
    x: 4,
    y: 3,
    zIndex: 20,
  },
  text(
    ({ style }) => {
      const rows: string[] = []
      for (const info of renderer.actions.list()) {
        if (info.hidden || !info.id.startsWith("app.")) continue
        const name = (info.cmd ?? info.id).padEnd(10)
        const desc = (info.desc ?? "").padEnd(26)
        const keys = (info.keys ?? []).join(", ")
        rows.push(`${style.accent(`/ ${name}`)} ${style.dim(desc)} ${style.primary(keys)}`)
      }
      rows.push("")
      rows.push(style.bold("Try:"))
      rows.push(`${style.accent("/review")} autocomplete ergonomics`)
      rows.push(style.accent("open @src/renderer/index.ts and explain it"))

      return rows.join("\n")
    },
    { wrap: "none" }
  )
)
renderer.overlay.add(() => help)

// ── Actions ──────────────────────────────────────────────────────────
// Each slash command is an action. `actionsSource` picks them up
// automatically for /-triggered completion, and they can be bound to
// keys or dispatched programmatically.

renderer.actions.register({
  "app.clear": {
    cmd: "clear",
    desc: "clear the composer",
    fn: () => composer.state.set({ cursor: 0, value: "" }),
  },
  "app.help": {
    cmd: "help",
    desc: "toggle help overlay",
    fn: () => help.toggle(),
    keys: ["ctrl-h"],
  },
  "app.plan": { cmd: "plan", desc: "draft a tiny plan", fn: () => dispatchReply("plan") },
  "app.review": { cmd: "review", desc: "review the API shape", fn: () => dispatchReply("review") },
  "app.ship": { cmd: "ship", desc: "write a release note", fn: () => dispatchReply("ship") },
})

// ── Autocomplete ─────────────────────────────────────────────────────

const completions = autocomplete({
  input: composer,
  maxHeight: 8,
  sources: {
    file: filesSource(),
    slash: actionsSource({ actions: renderer.actions }),
  },
})

// ── Footer ───────────────────────────────────────────────────────────

renderer.ui.add(() =>
  box(
    { flexDirection: "column", padding: [0, 1], style: "ui" },
    box(
      { flexDirection: "row", gap: 1 },
      spinner({ color: "accent", running: busy }),
      text(({ style }) => style.primary.bold("agent"), { width: 5 }),
      text(({ style }) => `${style.dim("model:")} ${style.success(model())}`),
      text(({ style }) => `${style.dim("status:")} ${style.accent(status())}`)
    ),
    progress({ color: "primary", label: "auto", total: 1, value: progressValue, visible: busy }),
    text(({ style }) => style.dim("/ commands · @ files · ctrl-h help · ctrl-c quit")),
    completions,
    box(
      { flexDirection: "row", gap: 1 },
      text(({ style }) => style.primary("❯"), { width: 1 }),
      composer
    )
  )
)

// ── Intro + welcome toast ────────────────────────────────────────────

renderer.stream.append(() =>
  markdown(`## agent harness

A mock coding-assistant shell built on **@zaly/tui**. Try \`/\` for commands, \`@\` for files, or just ask a question.`)
)

// Toast: a small floating overlay at the top that auto-dismisses after
// a few seconds. Non-modal — the user can keep typing while it's up.
const toast = overlay(
  {
    border: "rounded",
    borderTitle: "welcome",
    padding: [0, 1],
    width: 44,
    x: 4,
    y: 1,
    zIndex: 30,
  },
  text(
    ({ style }) =>
      `${style.accent("ctrl-h")} ${style.dim("for help")}  ·  ${style.accent("ctrl-c")} ${style.dim("to quit")}`
  )
)

// ── Reply streaming ──────────────────────────────────────────────────

const replies: Record<string, string> = {
  fallback: `### Response

If this were a real app, the agent would now inspect files, stream tool output, and revise this answer as results arrive.

For the demo, the important part is that the response is just a **markdown node whose content grows over time**.`,
  plan: `### Tiny plan

1. Keep the **footer** responsible for active interaction only.
2. Use **overlays** for temporary panels like help or pickers.
3. Let the **stream** own durable history so scrollback stays useful.
4. Prefer a few opinionated helpers over lots of app boilerplate.`,
  review: `### Quick review

The API feels strongest where it is **tree-shaped**:

- \`box(...)\`, \`text(...)\`, \`markdown(...)\`
- \`renderer.stream.append(node)\`
- \`renderer.ui.add(...)\`
- \`renderer.bind(...)\`

The footer story here already feels pretty nice: state is local, interaction is obvious, and the surface split is easy to explain.`,
  ship: `### Release note draft

**@zaly/tui 0.1.0** brings a compact direct-mode terminal UI toolkit with:

- stream + footer + overlay surfaces
- markdown, diff, code, input, menu, and autocomplete widgets
- signal-driven updates
- synchronized output and careful scrollback behavior

It is especially good at building coding-agent interfaces.`,
}

function dispatchReply(kind: string): void {
  if (busy()) return
  void streamReply(`/${kind}`, replies[kind] ?? replies.fallback)
}

async function streamReply(prompt: string, full: string): Promise<void> {
  setBusy(true)
  setStatus("thinking")
  setProgressValue(0)

  const reply = markdown("")
  renderer.stream.append(() => markdown(`**you:** ${prompt}`))
  renderer.stream.append(() => reply)

  let i = 0
  while (i < full.length) {
    const take = 1 + Math.floor(Math.random() * 9)
    i = Math.min(i + take, full.length)
    reply.state.content = full.slice(0, i)
    setProgressValue(i / full.length)
    await new Promise((r) => setTimeout(r, 10 + Math.floor(Math.random() * 18)))
  }

  setStatus("ready")
  setProgressValue(1)
  setBusy(false)
}

composer.on("submit", ({ value }, self) => {
  if (busy() || value.trim() === "") return
  self.state.set({ cursor: 0, value: "" })
  const prompt = value.trim()
  const body = prompt.includes("input.ts")
    ? `### \`src/widgets/input.ts\`\n\nThat widget keeps editing state local, exposes actions through the router, and grows vertically with wrapped content.`
    : replies.fallback
  void streamReply(prompt, body)
})

renderer.start()
renderer.overlay.add(() => toast).show()
setTimeout(() => {
  if (toast.mounted) toast.hide()
}, 3500)
