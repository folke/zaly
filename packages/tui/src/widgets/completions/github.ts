import type { CompletionSource, Matcher } from "../autocomplete.ts"
import type { Option, OptionRender } from "../select.ts"

import { stringWidth } from "@zaly/shared/ansi"
import { spawn } from "node:child_process"

/** A GitHub issue or pull request returned by `githubSource`. Shape
 *  mirrors the `gh` CLI's `--json number,title,state,author,url`
 *  output, with `type` added to distinguish issues from PRs. */
export type GithubItem = Option & {
  number: number
  title: string
  /** `"open"` / `"closed"` for issues; `"open"` / `"closed"` / `"merged"`
   *  for PRs. Kept as a string so we don't trip if gh evolves. */
  state: string
  type: "issue" | "pr"
  url: string
  author?: { login?: string }
}

export type GithubState = "open" | "closed" | "all"

export type GithubFetcher = (cwd: string, state: GithubState) => Promise<GithubItem[]>

export interface GithubSourceOptions {
  /** Working directory used to locate the repo. `gh` resolves the repo
   *  from the git remote of this dir. Default: `process.cwd()`. */
  cwd?: string
  /** Trigger regex. Default: `/(?<=^|\s)#/` — `#` preceded by start-of-
   *  string or whitespace (same lookbehind trick as `filesSource`). */
  trigger?: RegExp
  /** Prepended to the accepted value so the trigger character stays in
   *  the input. Default: `"#"`. */
  prefix?: string
  /** Which issues / PRs to include. Default: `"open"`. */
  state?: GithubState
  /** Per-kind cap passed to `gh`. Default: `50`. */
  limit?: number
  /** Override the fetch implementation. Mainly useful for tests — the
   *  default shells out to `gh`. The fetcher is called at most once per
   *  `githubSource` instance; results are cached thereafter. */
  fetcher?: GithubFetcher
}

/**
 * Completion source for GitHub issues and pull requests from the repo
 * at `cwd`. Shells out to the `gh` CLI on first use, caches the result,
 * and fuzzy-filters locally on subsequent calls so typing stays snappy.
 *
 * Accepts insert `#123 ` into the input — ready for a markdown-style
 * reference in a chat message or commit subject.
 *
 * ```ts
 * autocomplete({
 *   input: "chat-input",
 *   sources: {
 *     gh: githubSource(),
 *   },
 * })
 * ```
 *
 * Silently returns no items when `gh` isn't installed, the user isn't
 * authenticated, or the directory isn't a GitHub repo — so it's safe
 * to wire up unconditionally.
 */
export function githubSource(opts: GithubSourceOptions = {}): CompletionSource<GithubItem> {
  const cwd = opts.cwd ?? process.cwd()
  const trigger = opts.trigger ?? /(?<=^|\s)#/
  const prefix = opts.prefix ?? "#"
  const state: GithubState = opts.state ?? "open"
  const limit = opts.limit ?? 50
  const fetcher = opts.fetcher ?? defaultFetcher(limit)

  // Lazy, single-fetch cache. The Promise is reused by concurrent
  // callers so rapid keystrokes while the first fetch is in flight
  // don't spawn duplicate `gh` processes.
  let cache: Promise<GithubItem[]> | undefined

  return {
    accept: (item) => `${prefix}${item.number} `,
    async complete(_query: string, match: Matcher): Promise<GithubItem[]> {
      cache ??= fetcher(cwd, state).catch(() => [])
      const items = await cache
      const out: GithubItem[] = []
      for (const item of items) {
        // Match on "#<num> <title>" so users can type either digits or
        // words and both hit. Keeps ranking implicit — source order
        // (freshest first from gh) wins when scores tie.
        const target = `#${item.number} ${item.title}`
        if (!match(target)) continue
        out.push(item)
      }
      return out
    },
    render: defaultRender,
    triggers: [trigger],
  }
}

const defaultRender: OptionRender<GithubItem> = (item, _active, ctx) => {
  const { style } = ctx
  const num = `#${item.number}`
  const stateSlot = stateStyleSlot(item.state)
  const typeLabel = item.type === "pr" ? "pr" : "issue"
  const author = item.author?.login ? `@${item.author.login}` : ""

  // Layout: [#num] [state/type] title ............. @author
  // All chrome is left-aligned; author is the right-column hint.
  const lead = `${style.add("optionName")(num)} ${style.add(stateSlot)(`${item.state}·${typeLabel}`)} ${item.title}`

  if (author === "") return lead
  const gap = 2
  const leadW = stringWidth(lead)
  const hintW = stringWidth(author)
  const padded = ctx.width - leadW - hintW - gap
  if (padded < 1) return lead
  return lead + " ".repeat(padded + gap) + style.add("optionDesc")(author)
}

function stateStyleSlot(state: string): string {
  if (state === "open") return "success"
  if (state === "merged") return "accent"
  // "closed" and anything unknown → dim.
  return "muted"
}

/** Default fetcher — shells out to `gh issue list` + `gh pr list` in
 *  parallel. Either failing is swallowed so a repo with only issues
 *  (or only PRs) still works. */
function defaultFetcher(limit: number): GithubFetcher {
  const fields = "number,title,state,author,url"
  return async (cwd, state) => {
    const [issues, prs] = await Promise.all([
      runGh(cwd, ["issue", "list", "--state", state, "--json", fields, "--limit", String(limit)]),
      runGh(cwd, ["pr", "list", "--state", state, "--json", fields, "--limit", String(limit)]),
    ])
    return [
      ...parse(issues).map((x) => Object.assign(x, { type: "issue" as const })),
      ...parse(prs).map((x) => Object.assign(x, { type: "pr" as const })),
    ].map((item) => Object.assign(item, { text: `#${item.number} ${item.title}` }))
  }
}

function parse(out: string): Omit<GithubItem, "type">[] {
  try {
    return JSON.parse(out) as Omit<GithubItem, "type">[]
  } catch {
    return []
  }
}

function runGh(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    try {
      const child = spawn("gh", args, { cwd, stdio: ["ignore", "pipe", "ignore"] })
      let stdout = ""
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8")
      })
      child.on("close", (code) => {
        resolve(code === 0 ? stdout : "")
      })
      child.on("error", () => {
        resolve("")
      })
    } catch {
      resolve("")
    }
  })
}
