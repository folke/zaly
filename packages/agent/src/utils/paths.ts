// packages/agent/src/utils/paths.ts (or shared)
import { normPath } from "@zaly/shared"
import { join } from "pathe"

export const zalyPaths = {
  get cache(): string {
    return join(this.root, "cache")
  },
  get config(): string {
    return join(this.root, "config")
  },
  get logs(): string {
    return join(this.root, "logs")
  },
  get memory(): string {
    return join(this.root, "memory")
  },
  get root(): string {
    return normPath(process.env.ZALY_ROOT ?? "~/.zaly")
  },
  get sessions(): string {
    return join(this.root, "sessions")
  },
  /** Cross-run user state — last model picked, future prefs, etc.
   *  Distinct from `config/` (intended for user-editable settings);
   *  state is "things we remember between runs". */
  get state(): string {
    return join(this.root, "state.json")
  },
  get tmp(): string {
    return join(this.root, "tmp")
  },
}
