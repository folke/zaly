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
export type SpecialKeyName = (typeof specialKeys)[number]

declare const KeyPatternBrand: unique symbol

/** A validated, canonical key binding string. */
export type KeyPattern = string & { readonly [KeyPatternBrand]: true }

const MOD_NAMES = new Set<string>(["ctrl", "alt", "shift", "meta"])
const specialKeys = [
  "enter",
  "tab",
  "backspace",
  "delete",
  "space",
  "esc",
  "up",
  "down",
  "left",
  "right",
  "home",
  "end",
  "pageup",
  "pagedown",
  "insert",
  "f1",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  "f7",
  "f8",
  "f9",
  "f10",
  "f11",
  "f12",
] as const
const SPECIAL_KEY_NAMES = new Set<string>(specialKeys)

interface ParsedPattern {
  name: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

export class KeyPatternError extends Error {
  constructor(pattern: string, reason: string) {
    super(`invalid key pattern ${JSON.stringify(pattern)}: ${reason}`)
    this.name = "KeyPatternError"
  }
}

function parsePattern(pattern: string): ParsedPattern {
  const mods = { alt: false, ctrl: false, meta: false, shift: false }
  let name = pattern
  while (name.length > 0) {
    const dash = name.indexOf("-")
    if (dash <= 0) break
    const mod = name.slice(0, dash)
    if (!MOD_NAMES.has(mod)) throw new KeyPatternError(pattern, `unknown modifier: ${mod}`)
    if (mods[mod as KeyModifier]) throw new KeyPatternError(pattern, `duplicate modifier: ${mod}`)
    mods[mod as KeyModifier] = true
    name = name.slice(dash + 1)
  }

  const ret = normalizeKey({ ...mods, name })
  name = ret.name
  if (name === "") throw new KeyPatternError(pattern, "missing key name")
  if (name.includes("-") && name !== "-") throw new KeyPatternError(pattern, "too many keys")
  if (!isPrintableKeyName(name)) throw new KeyPatternError(pattern, `unknown key name: ${name}`)
  if (mods.shift && !canUseShiftModifier(name)) {
    throw new KeyPatternError(
      pattern,
      `shift-${name} will not trigger; bind the shifted character instead`
    )
  }
  return ret
}

function normalizeKey(p: ParsedPattern): ParsedPattern {
  if (/^[A-Z]$/.test(p.name)) return { ...p, name: p.name.toLowerCase(), shift: true }
  if (p.name === " ") return { ...p, name: "space" }
  return p
}

function isPrintableKeyName(s: string): boolean {
  // oxlint-disable-next-line typescript/no-misused-spread
  return SPECIAL_KEY_NAMES.has(s) || ([...s].length === 1 && !/[\p{C}]/u.test(s))
}

function canUseShiftModifier(name: string): boolean {
  return /^[a-zA-Z]$/.test(name) || SPECIAL_KEY_NAMES.has(name)
}

export function isKeyPattern(s: string): s is KeyPattern {
  try {
    canonical(s)
    return true
  } catch {
    return false
  }
}

/**
 * Canonical string form of a pattern or event — modifiers in a fixed
 * alphabetical order, then the key name, joined by `-`. Used by the
 * router to build a pattern index whose keys match regardless of how
 * the user spelled the modifier order (`"ctrl-shift-a"` and
 * `"shift-ctrl-a"` both canonicalize to `"ctrl-shift-a"`).
 */
export function canonical(patternOrEvent: string | KeyEvent): KeyPattern {
  const p =
    typeof patternOrEvent === "string" ? parsePattern(patternOrEvent) : normalizeKey(patternOrEvent)
  const parts: string[] = []
  if (p.alt) parts.push("alt")
  if (p.ctrl) parts.push("ctrl")
  if (p.meta) parts.push("meta")
  if (p.shift) parts.push("shift")
  parts.push(p.name)
  return parts.join("-") as KeyPattern
}

/**
 * Test whether an event matches a pattern (or any of a list of patterns).
 * Unspecified modifiers in the pattern must be *absent* on the event —
 * matching is strict, not inclusive, so `"a"` only matches a bare `a`
 * (no ctrl/alt/etc.).
 */
export function keyMatches(ev: KeyEvent, pattern: string | readonly string[]): boolean {
  if (Array.isArray(pattern)) {
    for (const p of pattern) if (keyMatches(ev, p)) return true
    return false
  }
  const p = parsePattern(pattern as string)
  const e = normalizeKey(ev)
  return (
    e.name === p.name &&
    e.ctrl === p.ctrl &&
    e.alt === p.alt &&
    e.shift === p.shift &&
    e.meta === p.meta
  )
}
