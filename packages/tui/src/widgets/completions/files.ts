import type { Dirent } from "node:fs"
import type { CompletionSource, Matcher } from "../autocomplete.ts"
import type { MenuItem } from "../menu.ts"

import { readdir } from "node:fs/promises"
import { resolve } from "pathe"
import { fuzzyScore } from "./fuzzy.ts"

export interface FilesSourceOptions {
  /** Base directory relative queries resolve against. Default:
   *  `process.cwd()`. */
  cwd?: string
  /** Trigger regex. Default: `/(?<=^|\s)@/` — `@` preceded by start-of-
   *  string or whitespace. Lookbehind keeps `match.start` on the `@`
   *  itself so the leading space isn't eaten on insertion. */
  trigger?: RegExp
  /** Prefix prepended to accepted values so the trigger character stays
   *  in the input after a pick (letting users keep typing to drill into
   *  subdirectories). Default: `"@"` — matches the default trigger.
   *  When customizing `trigger`, set this to the character your trigger
   *  represents. */
  prefix?: string
  /** Keep predicate. Default skips dotfiles. `entry` is a `Dirent`
   *  (so you can key off `.isFile()` / `.isDirectory()`); `abs` is the
   *  absolute path of the entry. */
  filter?: (entry: Dirent, abs: string) => boolean
  /** Cap on returned items. Default: 50. */
  limit?: number
}

type DirCache = Map<string, Dirent[]>

/**
 * Completion source for file paths. Splits the query at the last `/`
 * — everything before is a literal directory prefix, everything after
 * is fuzzy-matched against `readdir()` basenames. Directories render
 * with a trailing `/` so users can keep typing to drill in.
 *
 * ```ts
 * autocomplete({
 *   input: "chat-input",
 *   sources: {
 *     files: filesSource({ cwd: process.cwd() }),
 *   },
 * })
 * ```
 */
export function filesSource(opts: FilesSourceOptions = {}): CompletionSource {
  const cwd = opts.cwd ?? process.cwd()
  const trigger = opts.trigger ?? /(?<=^|\s)@/
  const prefix = opts.prefix ?? "@"
  const filter = opts.filter ?? ((ent): boolean => !ent.name.startsWith("."))
  const limit = opts.limit ?? 50
  const cache: DirCache = new Map()

  return {
    accept: (item) => {
      // Dirs keep the popup open (trigger still matches, user can
      // drill in). Files close it — a trailing space makes `#detect`
      // see whitespace in the query and bail.
      const v = item.value ?? ""
      return `${prefix}${v}${v.endsWith("/") ? "" : " "}`
    },
    async complete(query: string, match: Matcher): Promise<MenuItem[]> {
      const lastSlash = query.lastIndexOf("/")
      const dirPart = lastSlash === -1 ? "" : query.slice(0, lastSlash + 1)
      const absDir = resolve(cwd, dirPart)

      let entries = cache.get(absDir)
      if (entries === undefined) {
        try {
          entries = await readdir(absDir, { withFileTypes: true })
        } catch {
          return []
        }
        cache.set(absDir, entries)
      }

      // The widget's matcher closes over the full query (`src/wid`) but
      // we want to match against just the basename component — rebuild
      // a matcher bound to the post-slash fragment via a shared `match`
      // call over the bare name. The provided matcher still works for
      // callers that supply their own `trigger` without slash scoping.
      const baseQuery = lastSlash === -1 ? query : query.slice(lastSlash + 1)
      const base: Matcher = baseQuery === query ? match : (s) => fuzzyScore(baseQuery, s)

      const out: MenuItem[] = []
      for (const ent of entries) {
        const abs = resolve(absDir, ent.name)
        if (!filter(ent, abs)) continue
        if (!base(ent.name)) continue
        const isDir = ent.isDirectory()
        const label = isDir ? `${ent.name}/` : ent.name
        out.push({ label, value: `${dirPart}${label}` })
        if (out.length >= limit) break
      }
      return out
    },
    triggers: [trigger],
  }
}
