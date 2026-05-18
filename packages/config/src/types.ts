import type { ProjectPaths } from "@zaly/shared/paths"
import type { ResourceManager } from "./resource/manager.ts"

export type Settings = {
  $schema?: string
  agent?: {}
  ui?: {
    /** Theme name or path to custom theme file */
    theme?: string
  }
  resources?: {
    packs?: string[]
    plugins?: string[]
    skills?: string[]
    themes?: string[]
    prompts?: string[]
  }
}

export type LoadedSettings<T extends "user" | "project" = "user" | "project"> = {
  type: T
  dir: string
  settings?: Settings
}

export type Config = {
  settings: Settings
  resources: ResourceManager
  paths: ProjectPaths
  user: LoadedSettings<"user">
  project: LoadedSettings<"project">
}

export type State = {
  lastModel?: string
}
