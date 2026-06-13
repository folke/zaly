import type { FindOptions } from "@zaly/shared/find"
import type { CompletionSource } from "../autocomplete.ts"
import type { PickerItem } from "../picker.ts"

import { normPath } from "@zaly/shared"
import { createIterable, lazy, memo } from "../../core/reactive.ts"

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
}

type File = PickerItem & { file: string }

/** Completion source for files. Uses `@zaly/shared/find` under the hood, so
 * supports all the same options and respects .gitignore by default. */
export function filesSource(opts: FilesSourceOptions = {}): CompletionSource<File> {
  const cwd = normPath(opts.cwd)
  const trigger = opts.trigger ?? /(?<=^|\s)@/
  const prefix = opts.prefix ?? "@"
  return {
    accept: (item) => {
      // Dirs keep the popup open (trigger still matches, user can
      // drill in). Files close it — a trailing space makes `#detect`
      // see whitespace in the query and bail.
      const v = item.file
      return `${prefix}${v}${v.endsWith("/") ? "" : " "}`
    },
    complete: lazy(() => {
      const iter = createIterable(async function* iterFiles() {
        const { find } = await import("@zaly/shared/find")
        for await (const f of find({ ...opts, cwd })) {
          const ff = Array.isArray(f) ? f : [f]
          yield ff.map((file) => ({ file, name: file, text: file }))
        }
      })
      return memo(() => [...iter().result])
    }),
    triggers: [trigger],
  }
}
