import type { EnvPaths } from "./env.ts"

import { join } from "pathe"
import { envPaths } from "./env.ts"

let env: EnvPaths | undefined

export const zalyPaths = {
  get config(): string {
    return this.env.config
  },

  get env(): EnvPaths {
    return (env ??= envPaths())
  },

  /** Installed plugins directory */
  get plugins(): string {
    return join(this.env.data, "plugins")
  },

  get sessions(): string {
    return join(this.env.data, "sessions")
  },

  /** state.json is for cross-run user state — last model picked, future prefs, etc. */
  get state(): string {
    return join(this.env.state, "state.json")
  },
}
