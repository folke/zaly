import type { Config } from "./types.ts"

export type ReviverType = "env"
export type ReviverIssue = { type: ReviverType; path: string; value: string; msg: string }

type ReviverCtx = {
  issues: ReviverIssue[]
  path: string
}

export function settingsReviver(key: string, value: unknown) {
  return reviver(key, value)
}

export function settingsReviverIssues(settings: Config) {
  const issues: ReviverIssue[] = []
  check("settings", settings, { issues, path: "settings" })
  return issues
}

function reviver(key: string, value: unknown, ctx?: ReviverCtx) {
  if (typeof value !== "string") return value
  if (value.includes("$")) return envReviver(key, value, ctx)
  return value
}

function envReviver(_key: string, value: string, ctx?: ReviverCtx) {
  return value.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, braced, bare) => {
      const res = process.env[braced ?? bare]
      if (res === undefined && ctx)
        ctx.issues.push({
          msg: `env var \`${match}\` is not set`,
          path: ctx.path,
          type: "env",
          value: match,
        })
      return res ?? match
    }
  )
}

function check(key: string, value: unknown, ctx: ReviverCtx) {
  reviver(key, value, ctx)
  if (typeof value === "object" && value !== null) {
    const isArray = Array.isArray(value)
    for (const k of Object.keys(value)) {
      const next = isArray ? `${ctx.path}[${k}]` : `${ctx.path}.${k}`
      check(k, value[k as keyof typeof value], {
        issues: ctx.issues,
        path: next,
      })
    }
  }
}
