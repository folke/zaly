import type { ActionDef, BuiltinAction } from "./actions.ts"

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
  "menu.cancel": {
    desc: "cancel the menu",
    hidden: true,
    keys: ["esc"],
  },
  "menu.complete": {
    desc: "complete the active item",
    hidden: true,
    keys: ["tab"],
  },
  "menu.first": {
    desc: "jump to the first item",
    hidden: true,
    keys: ["home"],
  },
  "menu.last": {
    desc: "jump to the last item",
    hidden: true,
    keys: ["end"],
  },
  "menu.next": {
    desc: "move to the next item",
    hidden: true,
    keys: ["down", "ctrl-n"],
  },
  "menu.pagedown": {
    desc: "move down one page",
    hidden: true,
    keys: ["pagedown", "ctrl-d"],
  },
  "menu.pageup": {
    desc: "move up one page",
    hidden: true,
    keys: ["pageup", "ctrl-u"],
  },
  "menu.prev": {
    desc: "move to the previous item",
    hidden: true,
    keys: ["up", "ctrl-p"],
  },
  "menu.select": {
    desc: "select the active item",
    hidden: true,
    keys: ["enter"],
  },
}
