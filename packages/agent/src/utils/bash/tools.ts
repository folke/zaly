/**
 * Built-in tool registry — per-command knowledge of which args are
 * input files, output files, and which invocation modes are too
 * complex to safely model.
 *
 * The policy engine consults this registry alongside explicit redirect
 * info from the parser to determine per-command file I/O for the
 * fileRead/fileWrite policy hooks.
 */
export interface ToolSpec {
  /** File paths the command will read from, derived from args. */
  reads?: (args: string[]) => string[]
  /** File paths the command will write to. */
  writes?: (args: string[]) => string[]
  /** Returns true if the args invoke a mode the parser can't safely
   *  reason about (e.g. `sed -e 'w out'`, `find -exec`). Forces ask. */
  unsafe?: (args: string[]) => boolean
}

/** All bare positional args (no leading dash). Default for many
 *  read-only utilities. */
function positionals(args: string[]): string[] {
  return args.filter((a) => !a.startsWith("-") && a !== "")
}

/** All positionals after the first one (e.g. `grep PATTERN file...`). */
function positionalsAfterFirst(args: string[]): string[] {
  const out: string[] = []
  let seenFirst = false
  for (const a of args) {
    if (a.startsWith("-") || a === "") continue
    if (!seenFirst) {
      seenFirst = true
      continue
    }
    out.push(a)
  }
  return out
}

// ── sed ──────────────────────────────────────────────────────────────────

/** Flags whose value is the *next* arg, not part of the script. */
const SED_VALUE_FLAGS = new Set(["-e", "--expression", "-f", "--file"])

/** Walk sed args, returning [scripts, positionalsAfterScript]. The
 *  "script" is everything passed via `-e` plus the first bare arg
 *  (the implicit script when no `-e` is given). Positionals after
 *  that are input files. */
function sedSplit(args: string[]): { scripts: string[]; files: string[] } {
  const scripts: string[] = []
  const files: string[] = []
  let needsImplicitScript = !args.some(
    (a) => a === "-e" || a === "--expression" || a === "-f" || a === "--file"
  )

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith("-")) {
      if (SED_VALUE_FLAGS.has(a) && i + 1 < args.length) {
        if (a === "-e" || a === "--expression") scripts.push(args[i + 1])
        i++ // consume value
      }
      continue
    }
    if (needsImplicitScript) {
      scripts.push(a)
      needsImplicitScript = false
      continue
    }
    files.push(a)
  }
  return { files, scripts }
}

const SED_INPLACE = new Set(["-i", "--in-place"])

function sedReads(args: string[]): string[] {
  return sedSplit(args).files
}

function sedWrites(args: string[]): string[] {
  // `-i` rewrites positional input files; also supports `-i.bak` form.
  const inPlace = args.some((a) => SED_INPLACE.has(a) || a.startsWith("-i."))
  return inPlace ? sedSplit(args).files : []
}

function sedUnsafe(args: string[]): boolean {
  // `w` / `W` write commands and `r` / `R` read commands inside the
  // script can do file I/O the parser can't see. Bail to ask.
  for (const script of sedSplit(args).scripts) {
    if (/(?:^|;|\n)\s*[wWrR]\s+\S/.test(script)) return true
  }
  return false
}

// ── awk ──────────────────────────────────────────────────────────────────

function awkReads(args: string[]): string[] {
  // awk usage: `awk [opts] 'script' [files...]` or `awk [opts] -f file [files...]`
  // Files come after the script. Skip flags + their values.
  let sawScript = false
  let usingFFlag = false
  const files: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "-f" || a === "--file") {
      if (i + 1 < args.length) files.push(args[i + 1]) // script file is read too
      i++
      sawScript = true
      usingFFlag = true
      continue
    }
    if (a.startsWith("-")) {
      // Some awk flags take a value (-v, -F)
      if (a === "-v" || a === "-F") i++
      continue
    }
    if (!sawScript) {
      sawScript = true
      continue
    }
    files.push(a)
  }
  return usingFFlag ? files : files
}

function awkUnsafe(args: string[]): boolean {
  // awk's `print > file` and `printf > file` inside a script write to
  // files. Detecting reliably without parsing the script is hard, so
  // bail to ask if the script (or any -e value) contains a `>` operator.
  // Conservative — false positives are fine for "ask".
  let sawScript = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "-f" || a === "--file" || a === "-v" || a === "-F") {
      i++
      continue
    }
    if (a.startsWith("-")) continue
    if (!sawScript) {
      sawScript = true
      if (/[>|]/.test(a)) return true
    }
  }
  return false
}

// ── find ─────────────────────────────────────────────────────────────────

function findReads(args: string[]): string[] {
  // First positional (or `.`) is the path. Multiple paths possible
  // before the first `-action` flag.
  const out: string[] = []
  for (const a of args) {
    if (a.startsWith("-")) break
    out.push(a)
  }
  return out.length > 0 ? out : ["."]
}

function findUnsafe(args: string[]): boolean {
  // `-delete`, `-exec`, `-execdir`, `-ok`, `-okdir` all do work we
  // can't trace.
  return args.some(
    (a) => a === "-delete" || a === "-exec" || a === "-execdir" || a === "-ok" || a === "-okdir"
  )
}

// ── dynamic execution ────────────────────────────────────────────────────
//
// These commands run arbitrary code passed as arguments or sourced from
// files. We can't reason about their effects from the parser; force ask.

const dynamicExec = (): boolean => true

// ── registry ─────────────────────────────────────────────────────────────

export const TOOLS: Partial<Record<string, ToolSpec>> = {
  ".": { unsafe: dynamicExec }, // sh: source alias
  awk: { reads: awkReads, unsafe: awkUnsafe },
  basename: {},
  cat: { reads: positionals },
  cd: {},
  cut: { reads: positionals },
  diff: { reads: positionals },
  dirname: {},
  echo: {},
  eval: { unsafe: dynamicExec }, // runs its argument as shell input
  exec: { unsafe: dynamicExec }, // replaces the shell process
  file: { reads: positionals },
  find: { reads: findReads, unsafe: findUnsafe },
  grep: { reads: positionalsAfterFirst },
  head: { reads: positionals },
  hexdump: { reads: positionals },
  less: { reads: positionals },
  ls: { reads: positionals },
  more: { reads: positionals },
  od: { reads: positionals },
  printf: {},
  pwd: {},
  readlink: { reads: positionals },
  realpath: { reads: positionals },
  rg: { reads: positionalsAfterFirst },
  sed: { reads: sedReads, unsafe: sedUnsafe, writes: sedWrites },
  sort: { reads: positionals },
  source: { unsafe: dynamicExec }, // bash: runs the file in current shell
  stat: { reads: positionals },
  tail: { reads: positionals },
  tree: { reads: positionals },
  uniq: { reads: positionals },
  wc: { reads: positionals },
  xxd: { reads: positionals },
}
