import type { Input } from "@zaly/tui/widgets/input"

import { createRef, createRenderer } from "@zaly/tui"
import { autocomplete } from "@zaly/tui/widgets/autocomplete"
import { box } from "@zaly/tui/widgets/box"
import { actionsSource, filesSource, githubSource } from "@zaly/tui/widgets/completions"
import { input } from "@zaly/tui/widgets/input"
import { markdown } from "@zaly/tui/widgets/markdown"
import { text } from "@zaly/tui/widgets/text"

/**
 * Autocomplete demo wired to the built-in completion sources:
 *
 *   - `/` at the start of the line → `actionsSource` backed by the
 *     Renderer's action registry. Selecting a slash command dispatches
 *     the action and clears the trigger text (no stale `/foo` left in
 *     the input).
 *   - `@` mid-text → `filesSource`, browsing the current working
 *     directory. Selecting a file inserts its relative path — no
 *     trailing space, so you can keep typing to drill into subdirs.
 *
 * A few app-level actions are registered so there's something real to
 * dispatch when slash commands are picked.
 */

const renderer = await createRenderer()

const { logger: log } = renderer

// App-level actions. `register` merges by id, so these compose with
// the bundled defaults (`global.quit`, input/menu bindings, etc.)
// without clobbering them.
renderer.actions.register({
  "app.clear": {
    cmd: "clear",
    desc: "clear the stream surface",
    fn: () => {
      log.success("stream cleared (demo — no-op)")
    },
  },
  "app.greet": {
    cmd: "greet",
    desc: "say hello back",
    fn: () => {
      log.info("hello! 👋")
    },
  },
  "app.model": {
    cmd: "model",
    desc: "pick the active model",
    fn: () => {
      log.info("would open model picker")
    },
  },
  "app.theme": {
    cmd: "theme",
    desc: "switch between bundled themes",
    fn: () => {
      log.info("would open theme switcher")
    },
  },
  "app.tokens": {
    cmd: "tokens",
    desc: "show token usage for this session",
    fn: () => {
      log.info("tokens: 1,234 in / 789 out (demo)")
    },
  },
})

const chatInput = createRef<Input>()

renderer.ui.add(() =>
  box(
    { flexDirection: "column", padding: [0, 1], style: "ui" },
    text(
      ({ style }) =>
        `${style.primary("›")} ${style.dim("enter · / actions · @ files · # issues/prs · ctrl-c quit")}`
    ),
    box(
      { flexDirection: "row", gap: 1 },
      text(({ style }) => style.primary("❯"), { width: 1 }),
      input({ placeholder: "try / or @ …" })
        .ref(chatInput)
        .focus()
        .on("submit", ({ value }, self) => {
          if (value.trim() === "") return
          renderer.stream.append(() => markdown(`**you:** ${value}`))
          self.state.set({ cursor: 0, value: "" })
        })
    ),
    autocomplete({
      input: chatInput,
      maxHeight: 8,
      sources: {
        files: filesSource(),
        gh: githubSource(),
        slash: actionsSource({ actions: renderer.actions }),
      },
    })
  )
)

renderer.start()
