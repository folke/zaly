import type { FindOptions } from "@zaly/shared/find"
import type { Progressive } from "../../core/reactive.ts"
import type { CompletionSource } from "../autocomplete.ts"
import type { PickerItem } from "../picker.ts"

import { normPath } from "@zaly/shared"
import { createIterable, signal } from "../../core/reactive.ts"

export interface FilesSourceOptions extends FindOptions {
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
  refreshInterval?: number
}

type File = PickerItem & { file: string }

/** Completion source for files. Uses `@zaly/shared/find` under the hood, so
 * supports all the same options and respects .gitignore by default. */
export function filesSource(opts: FilesSourceOptions = {}): CompletionSource<File> {
  const cwd = normPath(opts.cwd)
  const trigger = opts.trigger ?? /(?<=^|\s)@/
  const prefix = opts.prefix ?? "@"
  let results: Progressive<readonly File[]> | undefined
  const [gen, setGen] = signal(0)
  let lastRefresh = 0
  return {
    accept: (item) => {
      // Dirs keep the popup open (trigger still matches, user can
      // drill in). Files close it — a trailing space makes `#detect`
      // see whitespace in the query and bail.
      const v = item.file
      return `${prefix}${v}${v.endsWith("/") ? "" : " "}`
    },
    get complete() {
      const now = performance.now()
      if (!results?.loading() && now - lastRefresh > (opts.refreshInterval ?? 10_000)) {
        setGen((g) => g + 1) // Refresh results
        lastRefresh = now
      }
      return (results ??= createIterable<File>(async function* iterFiles() {
        gen() // Re-run when `gen` changes
        const { find } = await import("@zaly/shared/find")
        for await (const f of find({ ...opts, cwd })) {
          const ff = Array.isArray(f) ? f : [f]
          yield ff.map((file) => ({ file, text: file }))
        }
      }))
    },
    triggers: [trigger],
  }
}
