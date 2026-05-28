import type { Action, ActionDef, KeyBinding, Renderer, Theme } from "@zaly/tui"
import type { NotifProps } from "@zaly/tui/services/notifier"
import type { PickOpts } from "@zaly/tui/services/picker"
import type { ThemeLoader } from "@zaly/tui/themes"
import type { Overlay } from "@zaly/tui/widgets/overlay"
import type { PickerItem } from "@zaly/tui/widgets/picker"
import type { Plugin } from "../plugin.ts"

import { toLoader } from "../plugin.ts"

export class UiApi {
  #plugin: Plugin

  constructor(plugin: Plugin) {
    this.#plugin = plugin
  }

  get #host() {
    return this.#plugin.host
  }

  get #renderer(): Renderer {
    return this.#host.renderer
  }

  async pick<T extends PickerItem<unknown> = PickerItem>(
    opts: Omit<PickOpts<T>, "input">
  ): Promise<T | undefined> {
    return this.#host.pick(opts)
  }

  notify(msg: string, opts?: NotifProps): Overlay {
    return this.#host.notify(msg, opts)
  }

  get theme(): Theme {
    return this.#renderer.theme
  }

  set theme(t: Theme) {
    this.#renderer.theme = t
  }

  bind(binding: KeyBinding): () => void {
    const off = this.#renderer.bind(binding)
    this.#plugin.cleanup(off)
    return off
  }

  registerActions(actions: Action[]): () => void {
    const off = this.#renderer.actions.register(actions)
    this.#plugin.cleanup(off)
    return off
  }

  async loadTheme(name: string): Promise<Theme> {
    this.#plugin.assertLoaded()
    return this.#host.loadTheme(name)
  }

  async registerTheme(name: string, theme: Partial<Theme> | ThemeLoader) {
    this.#plugin.assertLoaded()
    const { themeRegistry } = await import("@zaly/tui/themes")
    this.#plugin.cleanup(themeRegistry.register(name, toLoader(theme)))
  }
}
