import type { Menu } from "../widgets/menu.ts"
import type { ActionDefs } from "./keymap.ts"

/**
 * Default action catalogue for `Menu`. Apps compose this with other
 * action defs (input, global) and feed the result through
 * `buildKeymaps` before installing in the router.
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
