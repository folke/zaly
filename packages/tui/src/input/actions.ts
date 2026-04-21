import type { Renderer } from "../renderer/index.ts"
import type { Input } from "../widgets/input.ts"
import type { Menu } from "../widgets/menu.ts"
import type { ActionDefs, Keymaps } from "./keymap.ts"

export const globalActions: ActionDefs<"global", Renderer> = {
  "global.quit": { desc: "quit", keys: ["ctrl-c"] },
}

/**
 * Default action catalogue for the `Input` widget — one entry per
 * method on `Input.actions` with a human-readable description and a
 * default key binding. Apps compose this with their own action defs
 * and pass the result through `buildKeymaps` to install in the router.
 *
 * Plugins that extend Input (e.g. a vim-mode addon) should export
 * their own `ActionDefs<scope, Input>` objects and let the app spread
 * them alongside `inputActions` — see `docs/…/keymap.md` for the
 * composition pattern.
 */
export const inputActions: ActionDefs<"input", Input> = {
  "input.cursorDown": {
    desc: "move cursor down one line",
    keys: ["down"],
  },
  "input.cursorLeft": {
    desc: "move cursor left",
    keys: ["left"],
  },
  "input.cursorLineEnd": {
    desc: "jump to end of current line",
    keys: ["end", "ctrl-e"],
  },
  "input.cursorLineStart": {
    desc: "jump to start of current line",
    keys: ["home", "ctrl-a"],
  },
  "input.cursorRight": {
    desc: "move cursor right",
    keys: ["right"],
  },
  "input.cursorUp": {
    desc: "move cursor up one line",
    keys: ["up"],
  },
  "input.deleteCharBack": {
    desc: "delete the character before the cursor",
    keys: ["backspace"],
  },
  "input.deleteCharForward": {
    desc: "delete the character at the cursor",
    keys: ["delete"],
  },
  "input.deleteWordBack": {
    desc: "delete the word before the cursor",
    keys: ["ctrl-w"],
  },
  "input.insertNewline": {
    desc: "insert a newline at the cursor (copies leading indent)",
    keys: ["shift-enter", "alt-enter"],
  },
  "input.insertTab": {
    desc: "insert an indent (two spaces) at the cursor",
    keys: ["tab"],
  },
  "input.submit": {
    desc: "submit the current value",
    keys: ["enter"],
  },
}

/**
 * Default action catalogue for `Menu`. Same composition pattern as
 * `inputActions` — apps spread this alongside their own defs before
 * feeding the result through `buildKeymaps`.
 */
export const menuActions: ActionDefs<"menu", Menu> = {
  "menu.cancel": {
    desc: "cancel the menu",
    keys: ["esc"],
  },
  "menu.first": {
    desc: "jump to the first item",
    keys: ["home"],
  },
  "menu.last": {
    desc: "jump to the last item",
    keys: ["end"],
  },
  "menu.next": {
    desc: "move to the next item",
    keys: ["down", "ctrl-n"],
  },
  "menu.prev": {
    desc: "move to the previous item",
    keys: ["up", "ctrl-p"],
  },
  "menu.select": {
    desc: "select the active item",
    keys: ["enter", "tab"],
  },
}

export const defaultActions = { ...globalActions, ...inputActions, ...menuActions }

export type DefaultKeymaps = Keymaps<typeof defaultActions>
