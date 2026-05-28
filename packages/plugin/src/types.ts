import type { AgentContext } from "@zaly/agent"
import type { LogApi, Logger } from "@zaly/shared/logger"
import type { Renderer, Theme } from "@zaly/tui"
import type { Notifier } from "@zaly/tui/services/notifier"
import type { Picker } from "@zaly/tui/services/picker"

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
