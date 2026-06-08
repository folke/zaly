import type { Dirent } from "node:fs"
import type { ScoredItem } from "../../search/matcher.ts"
import type { CompletionSource } from "../autocomplete.ts"
import type { PickerItem } from "../picker.ts"

import { readdir } from "node:fs/promises"
import { resolve } from "pathe"

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

type File = PickerItem & { file: string }

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
export function filesSource(opts: FilesSourceOptions = {}): CompletionSource<File> {
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
      const v = item.file
      return `${prefix}${v}${v.endsWith("/") ? "" : " "}`
    },
    async complete(query: string, match): Promise<ScoredItem<File>[]> {
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
      const base = baseQuery === query ? match : match.matcher(baseQuery)

      const out: ScoredItem<File>[] = []
      for (const ent of entries) {
        const abs = resolve(absDir, ent.name)
        if (!filter(ent, abs)) continue
        const score = base(ent.name)
        if (!score) continue
        const isDir = ent.isDirectory()
        const name = isDir ? `${ent.name}/` : ent.name
        const file = `${dirPart}${name}`
        out.push({ file, name, score, text: file })
        if (out.length >= limit) break
      }
      return out
    },
    triggers: [trigger],
  }
}
