import type { AgentContext } from "@zaly/agent"
import type { LogApi, Logger } from "@zaly/shared/logger"
import type { Notifier, Picker, Renderer, Theme } from "@zaly/tui"

/** Internal host capabilities used to implement PluginApi.
 *  Never exposed directly to plugin code.
 */
export type PluginHost = {
  ctx: AgentContext
  logger: Logger
  log: LogApi
  renderer: Renderer
  pick: Picker["pick"]
  notify: Notifier["notify"]
  loadTheme(name: string): Promise<Theme>
}
