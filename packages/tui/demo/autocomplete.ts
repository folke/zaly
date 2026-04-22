import {
  actionsSource,
  autocomplete,
  box,
  createRenderer,
  filesSource,
  githubSource,
  input,
  markdown,
  text,
} from "../src/index.ts"

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

const renderer = createRenderer()

const { log } = renderer

// App-level actions. `register` merges by id, so these compose with
// the bundled defaults (`global.quit`, input/menu bindings, etc.)
// without clobbering them.
renderer.actions.register({
  "app.clear": {
    desc: "clear the stream surface",
    fn: () => {
      log.success("stream cleared (demo — no-op)")
    },
    name: "clear",
  },
  "app.greet": {
    desc: "say hello back",
    fn: () => {
      log.info("hello! 👋")
    },
    name: "greet",
  },
  "app.model": {
    desc: "pick the active model",
    fn: () => {
      log.info("would open model picker")
    },
    name: "model",
  },
  "app.theme": {
    desc: "switch between bundled themes",
    fn: () => {
      log.info("would open theme switcher")
    },
    name: "theme",
  },
  "app.tokens": {
    desc: "show token usage for this session",
    fn: () => {
      log.info("tokens: 1,234 in / 789 out (demo)")
    },
    name: "tokens",
  },
})

renderer.ui.add(
  box(
    { bg: "bg", flexDirection: "column", padding: [0, 1] },
    text(
      ({ style }) =>
        `${style.primary("›")} ${style.dim("enter · / actions · @ files · # issues/prs · ctrl-c quit")}`
    ),
    box(
      { flexDirection: "row", gap: 1 },
      text(({ style }) => style.primary("❯"), { width: 1 }),
      input({ placeholder: "try / or @ …" })
        .id("chat-input")
        .focus()
        .on("submit", (value, self) => {
          if (value.trim() === "") return
          renderer.stream.append(markdown(`**you:** ${value}`))
          self.setState({ cursor: 0, value: "" })
        })
    ),
    autocomplete({
      input: "chat-input",
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
