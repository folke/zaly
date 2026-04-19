import type { ActionDefs, ActionMap, KeymapOverrides } from "../src/input/keymap.ts"

import { box, createRenderer, input, markdown, text } from "../src/index.ts"
import { inputActions } from "../src/input/actions.ts"
import { buildKeymaps } from "../src/input/keymap.ts"

/**
 * Minimal echo chat. Type a message, press Enter — it's appended to the
 * stream as a markdown node. Ctrl-C quits (wired through the `global`
 * scope, which the router resolves by walking up to the UI root).
 */

const renderer = createRenderer()

const field = input({ placeholder: "type a message…" })

// Footer: a styled prompt + the input on its own row.
renderer.ui.root.add(
  box(
    { bg: "bg", flexDirection: "column", padding: [0, 1] },
    text(({ style }) => `${style.primary("›")} ${style.dim("enter to send · ctrl-c to quit")}`),
    box(
      { flexDirection: "row", gap: 1 },
      text(({ style }) => style.primary("❯"), { width: 1 }),
      field
    )
  )
)

field.on("submit", (value) => {
  if (value.trim() === "") return
  renderer.stream.append(markdown(`**you:** ${value}`))
  field.state.value = ""
  field.state.cursor = 0
})

renderer.input.focus(field)

// ---- keymap wiring --------------------------------------------------------
// All bindings that the user could conceivably rebind go through the
// router's scoped keymap. Widget defaults live in `inputActions`; the
// demo contributes its own `global` scope for quit. Apps compose any
// number of ActionDefs objects — plugins will drop their own in the
// same bag.

const globalActions = {
  quit: () => {
    renderer.stop()
    process.exit(0)
  },
} satisfies ActionMap

const globalActionDefs: ActionDefs<"global", typeof globalActions> = {
  "global.quit": { desc: "quit the demo", keys: ["ctrl-c"] },
}

const actionDefs = { ...inputActions, ...globalActionDefs }

// User-overridable section. Load from a config file in a real app.
const overrides: KeymapOverrides<typeof actionDefs> = {}

renderer.input.registerActions("global", globalActions)
renderer.input.setKeymaps(buildKeymaps(actionDefs, overrides))

renderer.start()
