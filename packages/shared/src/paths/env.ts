import { homedir, tmpdir } from "node:os"
import { basename, join } from "pathe"
import { normPath } from "../path.ts"

export type EnvPaths = {
  app: string
  cache: string
  config: string
  data: string
  log: string
  tmp: string
  state: string
}

export type EnvPathKey = Exclude<keyof EnvPaths, "app">

export function envPaths(): EnvPaths {
  let paths: EnvPaths | undefined
  const { env } = process

  const appName = () => env.ZALY_APPNAME ?? "zaly"

  const path = (key: EnvPathKey) => {
    const envPath = env[`ZALY_${key.toUpperCase()}`]
    if (envPath) return normPath(envPath)
    if (env.ZALY_ROOT) return normPath(env.ZALY_ROOT, key)
    const name = appName()
    paths = paths?.app === name ? paths : _envPaths(name)
    return paths[key]
  }

  return {
    get app() {
      return appName()
    },
    get cache() {
      return path("cache")
    },
    get config() {
      return path("config")
    },
    get data() {
      return path("data")
    },
    get log() {
      return path("log")
    },
    get state() {
      return path("state")
    },
    get tmp() {
      return path("tmp")
    },
  }
}

function _envPaths(app: string): EnvPaths {
  const home = homedir()
  const tmp = tmpdir()
  const { env, platform } = process

  if (platform === "win32") {
    // Windows mappings
    const appData = env.APPDATA ?? join(home, "AppData", "Roaming")
    const localAppData = env.LOCALAPPDATA ?? join(home, "AppData", "Local")

    return {
      app,
      cache: join(localAppData, app, "Cache"),
      config: join(appData, app),
      data: join(localAppData, app, "Data"),
      log: join(localAppData, app, "Log"),
      state: join(localAppData, app, "State"),
      tmp: join(tmp, app),
    }
  }

  // Linux / macOS / POSIX (XDG Spec)
  return {
    app,
    cache: join(env.XDG_CACHE_HOME ?? join(home, ".cache"), app),
    config: join(env.XDG_CONFIG_HOME ?? join(home, ".config"), app),
    data: join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), app),
    log: join(env.XDG_STATE_HOME ?? join(home, ".local", "state"), app, "log"),
    state: join(env.XDG_STATE_HOME ?? join(home, ".local", "state"), app),
    tmp: join(tmp, basename(home), app),
  }
}
