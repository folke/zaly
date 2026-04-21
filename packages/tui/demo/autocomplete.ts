// oxlint-disable sort-keys
import type { MenuItem } from "../src/widgets/menu.ts"

import { autocomplete, box, createRenderer, input, markdown, text } from "../src/index.ts"

/**
 * Autocomplete demo. Same input-and-stream shape as `demo/input.ts`,
 * but with two completion sources wired up:
 *
 *   - `/` at the start of the line → slash commands
 *   - `@` mid-text → user mentions
 *
 * The popup lives in the UI footer directly above the input. It uses
 * `visible: false` to collapse when nothing matches, so the footer
 * height tracks the menu automatically.
 */

const renderer = createRenderer()

const slashCommands: MenuItem[] = [
  { value: "/help", hint: "show available commands" },
  { value: "/clear", hint: "clear the stream" },
  { value: "/model", hint: "pick a model" },
  { value: "/theme", hint: "switch theme" },
  { value: "/quit", hint: "exit the demo" },
  { value: "/status", hint: "show session status" },
  { value: "/tokens", hint: "show token usage" },
  { value: "/resume", hint: "resume last session" },
  { value: "/new", hint: "start a new conversation" },
  { value: "/export", hint: "export the session" },
]

const users: MenuItem[] = [
  { value: "@alice", hint: "Alice Cooper" },
  { value: "@bob", hint: "Bob Dylan" },
  { value: "@carol", hint: "Carol Kaye" },
  { value: "@dave", hint: "Dave Grohl" },
]

const field = input({ placeholder: "type a message, try / or @…" })
  .focus()
  .on("submit", (value, self) => {
    if (value.trim() === "") return
    renderer.stream.append(markdown(`**you:** ${value}`))
    self.setState({ cursor: 0, value: "" })
  })

const ac = autocomplete({
  input: field,
  maxHeight: 8,
  sources: {
    slash: {
      triggers: [/(?:^|\n)\s*\//],
      complete: (q) =>
        slashCommands.filter((c) => c.value.slice(1).toLowerCase().startsWith(q.toLowerCase())),
    },
    mention: {
      triggers: [/\B@/],
      complete: (q) =>
        users.filter((u) => u.value.slice(1).toLowerCase().startsWith(q.toLowerCase())),
    },
  },
  onComplete: (source, item) => {
    renderer.stream.append(markdown(`*completed via ${source}: ${item.value}*`))
  },
})

renderer.ui.add(
  box(
    { bg: "bg", flexDirection: "column", padding: [0, 1] },
    text(({ style }) => `${style.primary("›")} ${style.dim("enter to send · ctrl-c to quit")}`),
    box(
      { flexDirection: "row", gap: 1 },
      text(({ style }) => style.primary("❯"), { width: 1 }),
      field,
    ),
    ac,
  ),
)

ac.bindKeys()

renderer.start()
