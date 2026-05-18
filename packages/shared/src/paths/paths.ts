import type { EnvPaths } from "./env.ts"

import { homedir } from "node:os"
import { join } from "pathe"
import { encodePath, normPath } from "../path.ts"
import { findUp, gitRoot } from "../utils.ts"
import { envPaths } from "./env.ts"

let env: EnvPaths | undefined

export const zalyPaths = {
  get config(): string {
    return this.env.config
  },

  get env(): EnvPaths {
    return (env ??= envPaths())
  },

  pluginPath(plugin: string) {
    return join(this.plugins, encodePath(plugin))
  },

  /** Installed plugins directory */
  get plugins(): string {
    return join(this.env.data, "plugins")
  },

  project(cwd?: string): ProjectPaths {
    return projectPaths(cwd)
  },

  get sessions(): string {
    return join(this.env.data, "sessions")
  },

  /** state.json is for cross-run user state — last model picked, future prefs, etc. */
  get state(): string {
    return join(this.env.state, "state.json")
  },
}

export function isRemotePath(path: string): boolean {
  return /^(https?|npm|git|gh):/.test(path)
}

export type ProjectPaths = {
  cwd: string
  dotAgents: string[]
  dotZaly?: string
  git?: string
  root: string
  stop: string
}

export function projectPaths(cwd?: string): ProjectPaths {
  cwd = normPath(cwd)
  let git: string | undefined
  let stop: string | undefined
  let dotZaly: string | undefined
  let dotAgents: string[] | undefined
  return {
    cwd,
    get dotAgents(): string[] {
      return (dotAgents ??= findUp(cwd, ".agents", { all: true, stop: this.stop, type: "dir" }))
    },
    get dotZaly(): string | undefined {
      return (dotZaly ??= findUp(cwd, ".zaly", { stop: this.stop, type: "dir" }))
    },
    get git(): string | undefined {
      return (git ??= gitRoot(cwd))
    },
    get root() {
      return this.git ?? cwd
    },
    get stop() {
      return (stop ??= this.git ?? homedir())
    },
  }
}
