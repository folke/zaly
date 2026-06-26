import type { Renderer } from "../renderer/renderer.ts"
import type { Input } from "../widgets/input.ts"
import type { PickerActions } from "../widgets/picker.ts"
import type { Select } from "../widgets/select.ts"
import type { ActionDef } from "./actions.ts"

/**
 * Union of every built-in action id. Derived from widget `actions`
 * dicts plus the Renderer's `globalActions`. Used to constrain the
 * `defaultActions` catalog so TypeScript catches missing docs or
 * renamed actions at compile time.
 */
export type BuiltinAction =
  | keyof (Input["actions"] & Select["actions"] & Renderer["globalActions"])
  | PickerActions

/**
 * Catalog of built-in actions with descriptions and default bindings.
 * Typed as `Record<BuiltinAction, ActionInfo>` so missing entries are a
 * compile error — add an action to a widget and you'll be nudged to
 * document it here.
 *
 * The Renderer registers this into its `actions` registry at
 * construction; apps compose further catalogs via
 * `renderer.actions.register(...)`.
 */
export const defaultActions: Record<BuiltinAction, ActionDef> = {
  "global.quit": {
    cmd: "quit",
    desc: "quit",
    keys: ["ctrl-c"],
  },
  "input.cursorDown": {
    desc: "move cursor down one line",
    hidden: true,
    keys: ["down"],
  },
  "input.cursorLeft": {
    desc: "move cursor left",
    hidden: true,
    keys: ["left"],
  },
  "input.cursorLineEnd": {
    desc: "jump to end of current line",
    hidden: true,
    keys: ["end", "ctrl-e"],
  },
  "input.cursorLineStart": {
    desc: "jump to start of current line",
    hidden: true,
    keys: ["home", "ctrl-a"],
  },
  "input.cursorRight": {
    desc: "move cursor right",
    hidden: true,
    keys: ["right"],
  },
  "input.cursorUp": {
    desc: "move cursor up one line",
    hidden: true,
    keys: ["up"],
  },
  "input.deleteCharBack": {
    desc: "delete the character before the cursor",
    hidden: true,
    keys: ["backspace"],
  },
  "input.deleteCharForward": {
    desc: "delete the character at the cursor",
    hidden: true,
    keys: ["delete"],
  },
  "input.deleteWordBack": {
    desc: "delete the word before the cursor",
    hidden: true,
    keys: ["ctrl-w"],
  },
  "input.insertNewline": {
    desc: "insert a newline at the cursor (copies leading indent)",
    hidden: true,
    keys: ["shift-enter", "alt-enter"],
  },
  "input.insertTab": {
    desc: "insert an indent (two spaces) at the cursor",
    hidden: true,
    keys: ["tab"],
  },
  "input.paste": {
    desc: "paste text from the system clipboard, or attach a pasted image",
    hidden: true,
    keys: ["ctrl-v"],
  },
  "input.submit": {
    desc: "submit the current value",
    hidden: true,
    keys: ["enter"],
  },
  "picker.next": {
    desc: "move to the next item that matches the query",
    hidden: true,
    keys: ["ctrl-n"],
  },
  "picker.prev": {
    desc: "move to the previous item that matches the query",
    hidden: true,
    keys: ["ctrl-p"],
  },
  "select.accept": {
    desc: "select the active item",
    hidden: true,
    keys: ["enter"],
  },
  "select.close": {
    desc: "close",
    keys: ["esc"],
  },
  "select.complete": {
    desc: "complete the active item",
    hidden: true,
    keys: ["tab"],
  },
  "select.first": {
    desc: "jump to the first item",
    hidden: true,
    keys: ["home"],
  },
  "select.last": {
    desc: "jump to the last item",
    hidden: true,
    keys: ["end"],
  },
  "select.next": {
    desc: "move to the next item",
    hidden: true,
    keys: ["down"],
  },
  "select.page-down": {
    desc: "move down one page",
    hidden: true,
    keys: ["pagedown", "ctrl-d"],
  },
  "select.page-up": {
    desc: "move up one page",
    hidden: true,
    keys: ["pageup", "ctrl-u"],
  },
  "select.prev": {
    desc: "move to the previous item",
    hidden: true,
    keys: ["up"],
  },
}
