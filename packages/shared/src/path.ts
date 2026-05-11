import { homedir } from "node:os"
import { relative, resolve } from "pathe"
import { reverseResolveAlias } from "pathe/utils"

// Similar to path.resolve but also expands ~ to the user home
// directory. Accepts undefined / empty entries (filtered out) so
// callers can pass an optional base without a `?? process.cwd()`
// dance — `resolve()` defaults to `process.cwd()` when nothing
// absolute remains.
export function normPath(...paths: (string | undefined)[]) {
  return resolve(
    ...paths.filter((p): p is string => !!p).map((p) => p.replace(/^~(?=\/|\\|$)/, homedir()))
  )
}

export function prettyPath(path: string) {
  let rel = relative(process.cwd(), path)
  rel = rel === "" ? "." : rel
  rel = rel.startsWith("..") ? (reverseResolveAlias(path, { "~": homedir() })[0] ?? path) : rel
  return rel
}

/** Encoding rules (applied in order):
 *    `+` → `++`   (escape literal +)
 *    `%` → `%%`   (escape literal %)
 *    `/` → `+`    (path separator)
 *    `:` → `%`    (Windows drive colon) */
export function encodePath(path: string): string {
  return path.replace(/\+/g, "++").replace(/%/g, "%%").replace(/\//g, "+").replace(/:/g, "%")
}

export function decodePath(encoded: string): string {
  let out = ""
  let i = 0
  while (i < encoded.length) {
    const c = encoded[i]
    const next = encoded[i + 1]
    if (c === "+" && next === "+") {
      out += "+"
      i += 2
    } else if (c === "%" && next === "%") {
      out += "%"
      i += 2
    } else if (c === "+") {
      out += "/"
      i++
    } else if (c === "%") {
      out += ":"
      i++
    } else {
      out += c
      i++
    }
  }
  return out
}
