/**
 * Keyboard event shape + pattern-based matcher.
 *
 * `KeyEvent.name` is a canonical name:
 *   - Single characters for printable keys: `"a"`, `"A"`, `" "`, `"!"`. The
 *     `name` reflects the raw character the decoder produced — so `Shift+A`
 *     arrives as `{ name: "A", shift: true }` (terminals already fold
 *     shift into the uppercase byte for letters).
 *   - Named constants for non-printing keys: `"enter"`, `"tab"`, `"esc"`,
 *     `"backspace"`, `"delete"`, `"space"`, arrows `"up"/"down"/"left"/
 *     "right"`, navigation `"home"/"end"/"pageup"/"pagedown"/"insert"`,
 *     function keys `"f1"` .. `"f12"`.
 *
 * Patterns for `keyMatches` are dash-separated modifier prefixes plus the
 * name: `"a"`, `"ctrl-c"`, `"shift-tab"`, `"ctrl-shift-x"`. Unknown
 * prefixes are treated as literal characters in the name, so
 * `"something-foo"` is interpreted as the name `"something-foo"` rather
 * than a missing-modifier error.
 *
 * Modifier prefixes (order-independent):
 *   - `ctrl-`
 *   - `alt-`
 *   - `shift-`
 *   - `meta-`  (a.k.a. super / cmd)
 */

export interface KeyEvent {
  /** Canonical key name — raw character or one of the named constants above. */
  name: string
  /**
   * The literal text the keystroke would insert, when that makes sense.
   * For printable chars this is the char itself; for Enter, Tab, etc. it's
   * undefined. Widgets use this to decide whether to insert content vs.
   * treat the key as a command.
   */
  text?: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

/** Canonical modifier names used in `KeyPattern`. */
export type KeyModifier = "ctrl" | "alt" | "shift" | "meta"

/**
 * Named keys the decoder emits for non-printable keystrokes. Bindings
 * reference these directly (`"enter"`, `"f5"`, `"pageup"`, …).
 */
export type SpecialKeyName =
  | "enter"
  | "tab"
  | "backspace"
  | "delete"
  | "space"
  | "esc"
  | "up"
  | "down"
  | "left"
  | "right"
  | "home"
  | "end"
  | "pageup"
  | "pagedown"
  | "insert"
  | "f1"
  | "f2"
  | "f3"
  | "f4"
  | "f5"
  | "f6"
  | "f7"
  | "f8"
  | "f9"
  | "f10"
  | "f11"
  | "f12"

// Template-literal types need finite key sets; we enumerate printable
// ASCII letters + digits explicitly. Exotic chars (e.g. `?`, `!`, or
// non-ASCII) are still parseable at runtime — bindings just have to be
// widened via `as KeyPattern` or the caller can pass a bare string.
type AlphaLower =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z"
type AlphaUpper =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z"
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"

/** The key part of a `KeyPattern` — everything after the modifiers. */
export type KeyName = SpecialKeyName | AlphaLower | AlphaUpper | Digit

/**
 * Template-literal type for binding patterns: bare key, or up to three
 * stacked modifiers followed by a key. The runtime parser is tolerant of
 * an unknown prefix (it keeps it as part of the name), so the type is
 * stricter than the parser — patterns outside this union must go through
 * an explicit `as KeyPattern` cast if you really want them.
 */
export type KeyPattern =
  | KeyName
  | `${KeyModifier}-${KeyName}`
  | `${KeyModifier}-${KeyModifier}-${KeyName}`
  | `${KeyModifier}-${KeyModifier}-${KeyModifier}-${KeyName}`

const MOD_NAMES = new Set<string>(["ctrl", "alt", "shift", "meta"])

interface ParsedPattern {
  name: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

function parsePattern(pattern: string): ParsedPattern {
  const mods = { alt: false, ctrl: false, meta: false, shift: false }
  let rest = pattern
  // Peel `<modifier>-` off the front while the token before the next
  // dash is a recognised modifier name. Stops as soon as the head isn't
  // a modifier — so a pattern like `"foo-bar"` stays intact as the key
  // name `"foo-bar"`, never a malformed-modifier error.
  while (rest.length > 0) {
    const dash = rest.indexOf("-")
    if (dash <= 0) break
    const head = rest.slice(0, dash)
    if (!MOD_NAMES.has(head)) break
    mods[head as KeyModifier] = true
    rest = rest.slice(dash + 1)
  }
  return { ...mods, name: rest }
}

/**
 * Canonical string form of a pattern or event — modifiers in a fixed
 * alphabetical order, then the key name, joined by `-`. Used by the
 * router to build a pattern index whose keys match regardless of how
 * the user spelled the modifier order (`"ctrl-shift-a"` and
 * `"shift-ctrl-a"` both canonicalize to `"ctrl-shift-a"`).
 */
export function canonical(patternOrEvent: string | KeyEvent): string {
  const p = typeof patternOrEvent === "string" ? parsePattern(patternOrEvent) : patternOrEvent
  const parts: string[] = []
  if (p.alt) parts.push("alt")
  if (p.ctrl) parts.push("ctrl")
  if (p.meta) parts.push("meta")
  if (p.shift) parts.push("shift")
  parts.push(p.name)
  return parts.join("-")
}

/**
 * Test whether an event matches a pattern (or any of a list of patterns).
 * Unspecified modifiers in the pattern must be *absent* on the event —
 * matching is strict, not inclusive, so `"a"` only matches a bare `a`
 * (no ctrl/alt/etc.).
 */
export function keyMatches(ev: KeyEvent, pattern: KeyPattern | readonly KeyPattern[]): boolean {
  if (Array.isArray(pattern)) {
    for (const p of pattern) if (keyMatches(ev, p)) return true
    return false
  }
  const p = parsePattern(pattern as string)
  return (
    ev.name === p.name &&
    ev.ctrl === p.ctrl &&
    ev.alt === p.alt &&
    ev.shift === p.shift &&
    ev.meta === p.meta
  )
}
