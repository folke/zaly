import type { EnvPaths, ProjectPaths } from "@zaly/shared/paths"
import type { ResourceMatcher, ResourceType } from "./resource/resource.ts"
import type { ResolvedConfig, Config, ConfigScope } from "./types.ts"

import { normPath, readJson, withError, writeJson } from "@zaly/shared"
import { zalyPaths } from "@zaly/shared/paths"
import { stat } from "node:fs/promises"
import { defaultSettings } from "./defaults.ts"
import { ResourceManager } from "./resource/manager.ts"
import { resourceMatcher } from "./resource/resource.ts"
import { settingsReviver } from "./reviver.ts"
import { merge } from "./utils.ts"

export class ConfigFile<T extends ConfigScope = ConfigScope> {
  #config?: Config
  #scope: T
  #paths: EnvPaths
  #path: string

  private constructor(paths: EnvPaths, scope: ConfigScope) {
    this.#paths = paths
    this.#scope = scope as T
    this.#path = normPath(paths.config, "config.json")
  }

  static async load<T extends ConfigScope>(paths: EnvPaths, scope: T): Promise<ConfigFile<T>> {
    const file = new ConfigFile<T>(paths, scope)
    return await file.refresh()
  }

  get dir(): string {
    return this.#paths.config
  }

  get path(): string {
    return this.#path
  }

  get paths(): EnvPaths {
    return this.#paths
  }

  get scope(): T {
    return this.#scope
  }

  get $(): Config | undefined {
    return this.#config
  }

  async update(patch: Config): Promise<this> {
    this.#config = await writeJson<Config>(this.path, (prev) => merge({}, patch, prev))
    return this
  }

  async refresh(): Promise<this> {
    this.#config = undefined
    const { validateConfig } = await import("./schemas/gen/config.ts")
    const s = await stat(this.path).catch(() => undefined)
    if (!s?.isFile()) return this
    const data = await withError(
      () => readJson(this.path, settingsReviver),
      `Failed to load config from \`${this.path}\``
    )
    this.#config = validateConfig(data)
    return this
  }
}

export type ConfigManagerOpts = {
  cwd?: string
  workspace?: string
  /** Settings to override coming from CLI flags. */
  settings?: Config
  // FIXME:
  disabled?: ResourceType[]
}

export class ConfigManager {
  #opts: ConfigManagerOpts
  #cwd: string
  #config?: ResolvedConfig
  #user!: ConfigFile<"user">
  #project!: ConfigFile<"project">
  #workspace?: ConfigFile<"workspace">
  #paths: ProjectPaths
  #resources?: ResourceManager

  constructor(opts: ConfigManagerOpts) {
    this.#opts = opts
    this.#cwd = normPath(opts.cwd)
    this.#paths = zalyPaths.project(this.#cwd)
  }

  static async load(opts: ConfigManagerOpts): Promise<ConfigManager> {
    const manager = new ConfigManager(opts)
    return manager.refresh()
  }

  get config(): ResolvedConfig {
    return (this.#config ??= merge(
      {},
      this.#opts.settings,
      this.#project.$,
      this.#user.$,
      defaultSettings
    ))
  }

  get $(): ResolvedConfig {
    return this.config
  }

  get resources(): ResourceManager {
    return (this.#resources ??= new ResourceManager(this, this.#opts))
  }

  get paths(): ProjectPaths {
    return this.#paths
  }

  get user(): ConfigFile<"user"> {
    return this.#user
  }

  get project(): ConfigFile<"project"> {
    return this.#project
  }

  get workspace(): ConfigFile<"workspace"> | undefined {
    return this.#workspace
  }

  async update(patch: Config, scope: "user" | "project" = "user"): Promise<void> {
    const file = scope === "user" ? this.#user : this.#project
    await file.update(patch)
    this.#config = undefined
    this.#resources = undefined
  }

  async refresh(): Promise<this> {
    this.#user = await ConfigFile.load(zalyPaths.env, "user")
    this.#project = await ConfigFile.load(this.#paths.env, "project")
    if (this.#opts.workspace) {
      const wsPaths = zalyPaths.project(this.#opts.workspace)
      if (wsPaths.dotZaly !== this.#paths.dotZaly) {
        this.#workspace = await ConfigFile.load(wsPaths.env, "workspace")
      }
    }
    this.#config = undefined
    this.#resources = undefined
    return this
  }
}

export async function loadConfig(opts: ConfigManagerOpts): Promise<ConfigManager> {
  return ConfigManager.load(opts)
}
