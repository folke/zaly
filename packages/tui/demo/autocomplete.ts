import type { ActionDefs, ActionMap, KeymapOverrides } from "../src/input/keymap.ts"
import type { MenuItem } from "../src/widgets/menu.ts"

import { autocomplete, box, createRenderer, input, markdown, text } from "../src/index.ts"
import { inputActions } from "../src/input/actions.ts"
import { buildKeymaps } from "../src/input/keymap.ts"
import { menuActions } from "../src/input/menu-actions.ts"

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

const ac = autocomplete({
  input: field,
  maxHeight: 8,
  sources: {
    slash: {
      triggers: [/(?:^|\n)\s*\//],
      complete: (q) =>
        slashCommands.filter((c) =>
          c.value.slice(1).toLowerCase().startsWith(q.toLowerCase()),
        ),
    },
    mention: {
      triggers: [/\B@/],
      complete: (q) =>
        users.filter((u) => u.value.slice(1).toLowerCase().startsWith(q.toLowerCase())),
    },
  },
  onComplete: (source, item) => {
    // Swap the source string in if you want to branch — e.g. open a
    // secondary picker for `/model`. For the demo we just log.
    renderer.stream.append(markdown(`*completed via ${source}: ${item.value}*`))
  },
})

renderer.ui.root.add(
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

ac.bindKeys(renderer.input)

field.on("submit", (value) => {
  if (value.trim() === "") return
  renderer.stream.append(markdown(`**you:** ${value}`))
  field.state.value = ""
  field.state.cursor = 0
})

renderer.input.focus(field)

const globalActions = {
  quit: () => {
    renderer.stop()
    process.exit(0)
  },
} satisfies ActionMap

const globalActionDefs: ActionDefs<"global", typeof globalActions> = {
  "global.quit": { desc: "quit the demo", keys: ["ctrl-c"] },
}

// Compose the keymap from all three action catalogues. Menu actions
// are included so `up`/`down`/`enter`/`esc` reach the menu when open
// — though in this demo the autocomplete intercepts those keys on the
// input's own `key` bubble, so the menu bindings act as a secondary
// entry point (e.g. if focus ever moves onto the menu itself).
const actionDefs = { ...inputActions, ...menuActions, ...globalActionDefs }
const overrides: KeymapOverrides<typeof actionDefs> = {}

renderer.input.registerActions("global", globalActions)
renderer.input.setKeymaps(buildKeymaps(actionDefs, overrides))

renderer.start()
