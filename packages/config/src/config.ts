import type { EnvPaths, ProjectPaths } from "@zaly/shared/paths"
import type { ResourceType } from "./resource/resource.ts"
import type { Config, ConfigScope, ResolvedConfig } from "./types.ts"

import { normPath } from "@zaly/shared"
import { JsonFile } from "@zaly/shared/json"
import { zalyPaths } from "@zaly/shared/paths"
import { defaultSettings } from "./defaults.ts"
import { ResourceManager } from "./resource/manager.ts"
import { settingsReviver } from "./reviver.ts"
import { merge } from "./utils.ts"

export class ConfigFile<T extends ConfigScope = ConfigScope> extends JsonFile<Config, Config> {
  #scope: T
  #paths: EnvPaths

  protected constructor(paths: EnvPaths, scope: T) {
    super(normPath(paths.config, "config.json"), {
      default: {},
      reviver: settingsReviver,
      validate: (data) =>
        import("./schemas/gen/config.ts").then(({ validateConfig }) => validateConfig(data)),
    })
    this.#paths = paths
    this.#scope = scope
  }

  static async load<T extends ConfigScope>(paths: EnvPaths, scope: T): Promise<ConfigFile<T>> {
    const file = new ConfigFile<T>(paths, scope)
    return await file.refresh()
  }

  get paths(): EnvPaths {
    return this.#paths
  }

  get scope(): T {
    return this.#scope
  }

  override async update(patch: Config | ((prev?: Config) => Config)): Promise<this> {
    return super.update(typeof patch === "function" ? patch : (prev) => merge({}, patch, prev))
  }
}

export type ConfigManagerOpts = {
  cwd?: string
  workspace?: string
  disabled?: ResourceType[]
  /** Settings to override coming from CLI flags. */
  settings?: Config
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
