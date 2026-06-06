// oxlint-disable no-script-url
/**
 * Shiki integration microbench.
 *
 *     bun bench/shiki.bench.ts
 *
 * Splits the cost surface into the four axes that actually matter:
 *
 *   1. **Cold bootstrap** — first `createAnsiHighlighter()` call ever.
 *      Includes engine + WASM + theme load. Measured once per process,
 *      but it's what every fresh `zaly` invocation pays.
 *   2. **New-language load** — singleton is warm, theme is warm, but the
 *      grammar for this lang hasn't been registered yet. Each new lang
 *      mid-session pays this.
 *   3. **Warm highlighter call** — everything cached. The `loading`-chain
 *      mutex is the only overhead; the actual highlight is sync inside
 *      the returned closure.
 *   4. **`highlight(code, lang)` call** — the sync closure itself, after
 *      `createAnsiHighlighter` resolved. This is the per-block cost on
 *      every render.
 *
 * `isLang` is also measured — used to short-circuit unsupported langs
 * before paying any of the above.
 */

import { barplot, bench, do_not_optimize, summary } from "mitata"
import { isShikiLang } from "../src/schemas/gen/shiki.ts"
import { shiki } from "../src/shiki/api.ts"

// Fixtures — small/medium/large code blocks across the langs that
// actually show up in zaly sessions.
const SMALL_TS = `const x: number = 1
function add(a: number, b: number): number {
  return a + b
}`

const MEDIUM_TS = Array.from({ length: 30 }, (_, i) => `const v${i}: number = ${i}`).join("\n")

const LARGE_TS = Array.from({ length: 300 }, (_, i) => `const v${i}: number = ${i}`).join("\n")

const BASH = `#!/usr/bin/env bash
set -euo pipefail
find . -maxdepth 2 -type f | sort | head -20
for f in *.ts; do
  echo "checking $f"
  bun --bun tsc --noEmit "$f"
done`

const JSON_BLOCK = `{
  "name": "zaly",
  "version": "0.0.0",
  "dependencies": {
    "shiki": "^1.0.0"
  },
  "scripts": {
    "test": "bun test",
    "build": "bun build"
  }
}`

async function createAnsiHighlighter(opts: { langs: string[] }) {
  await shiki.load(opts.langs)
  return (code: string, lang: string) => shiki.highlight(code, lang)
}

// Pre-warm path: kick off cold bootstrap so subsequent benches measure
// the warm code path. Without this, the first iteration of the first
// bench would absorb the ~30ms one-time cost and look catastrophic.
const warmup = await createAnsiHighlighter({ langs: ["typescript"] })
await warmup(SMALL_TS, "typescript")

barplot(async () => {
  summary(async () => {
    // `isLang` should be a typia-generated near-no-op now (was a module
    // import previously). If it shows up here, the type-union check
    // grew teeth. `do_not_optimize` keeps V8 from constant-folding the
    // result and reporting fake-zero numbers.
    bench("isLang('typescript')", () => do_not_optimize(isShikiLang("typescript")))
    bench("isLang('nonsense-lang')", () => do_not_optimize(isShikiLang("nonsense-lang")))

    // Warm-singleton + already-loaded-lang: the steady-state cost of a
    // re-rendered code block. This is the path that runs on every
    // markdown/code re-render after first paint.
    bench("createAnsiHighlighter(loaded lang)", async () => {
      await createAnsiHighlighter({ langs: ["typescript"] })
    })

    // New-lang load — singleton warm, but this language's grammar
    // hasn't been registered yet. Pays the language JSON import +
    // `loadLanguage` registration. Different distinct langs each run
    // so we don't measure the cached path.
    bench("createAnsiHighlighter(new lang)", async () => {
      // `sql` is unlikely to be loaded already by the warmup; if
      // some other bench loads it first, swap for another unused lang.
      // (mitata runs benches iteratively; only the first call exercises
      // the new-lang path. The remaining iterations measure cache hit.)
      await createAnsiHighlighter({ langs: ["sql"] })
    })

    // Per-block render cost — the sync closure that `createAnsiHighlighter`
    // returns. This is what each `code()` widget calls inside its
    // `createAsync` body once shiki is loaded. `do_not_optimize` keeps
    // the highlighted output from being treated as dead by V8.
    const highlight = warmup
    bench("highlight(SMALL_TS, ts)", async () =>
      do_not_optimize(await highlight(SMALL_TS, "typescript")))
    bench("highlight(MEDIUM_TS, ts)", async () =>
      do_not_optimize(await highlight(MEDIUM_TS, "typescript")))
    bench("highlight(LARGE_TS, ts)", async () =>
      do_not_optimize(await highlight(LARGE_TS, "typescript")))

    // Other langs — same length, different grammars. Bash is regex-heavy
    // (lots of lookahead); JSON is simple. Worth seeing whether grammar
    // complexity matters for typical TUI snippets.
    const hBash = await createAnsiHighlighter({ langs: ["bash"] })
    const hJson = await createAnsiHighlighter({ langs: ["json"] })
    bench("highlight(BASH, bash)", async () => do_not_optimize(await hBash(BASH, "bash")))
    bench("highlight(JSON_BLOCK, json)", async () =>
      do_not_optimize(await hJson(JSON_BLOCK, "json")))
  })
})

// ── Engine comparison: Oniguruma vs JavaScript ────────────────────────
// Both engines render identical token output for supported grammars,
// but trade off differently:
//   - Oniguruma (default): full TextMate grammar support via a WASM
//     port of the Oniguruma regex engine. Heavier startup, faster on
//     complex/large input.
//   - JavaScript: pure-JS regex engine via shiki's compat layer. Skips
//     WASM entirely (smaller bundle, faster cold start), supports
//     most grammars zaly cares about (bash, json, ts, md, …) but not
//     every edge-case TextMate feature.
//
// This block builds both highlighters with the same lang+theme and
// measures the per-block highlight cost on identical fixtures. Use
// the numbers to decide whether swapping the engine in `shiki.ts` is
// worth it.

const [
  { createHighlighterCore },
  { createOnigurumaEngine },
  { createJavaScriptRegexEngine },
  langsMod,
  themeMod,
] = await Promise.all([
  import("shiki/core"),
  import("shiki/engine/oniguruma"),
  import("shiki/engine/javascript"),
  import("shiki/langs"),
  import(`shiki/themes/tokyo-night.mjs`),
])

async function makeHighlighter(engine: "oniguruma" | "javascript") {
  const e =
    engine === "oniguruma"
      ? await createOnigurumaEngine(import("shiki/wasm"))
      : createJavaScriptRegexEngine()
  const h = await createHighlighterCore({
    engine: e,
    langs: [langsMod.bundledLanguages.typescript(), langsMod.bundledLanguages.bash()],
    themes: [themeMod],
    warnings: false,
  })
  return (code: string, lang: string): unknown => h.codeToTokensBase(code, { lang: lang as never })
}

const oni = await makeHighlighter("oniguruma")
const js = await makeHighlighter("javascript")

// Warm-up so JIT decisions settle before mitata starts measuring.
oni(SMALL_TS, "typescript")
js(SMALL_TS, "typescript")

barplot(async () => {
  summary(async () => {
    bench("oniguruma: SMALL_TS", () => do_not_optimize(oni(SMALL_TS, "typescript")))
    bench("javascript: SMALL_TS", () => do_not_optimize(js(SMALL_TS, "typescript")))
    bench("oniguruma: MEDIUM_TS", () => do_not_optimize(oni(MEDIUM_TS, "typescript")))
    bench("javascript: MEDIUM_TS", () => do_not_optimize(js(MEDIUM_TS, "typescript")))
    bench("oniguruma: LARGE_TS", () => do_not_optimize(oni(LARGE_TS, "typescript")))
    bench("javascript: LARGE_TS", () => do_not_optimize(js(LARGE_TS, "typescript")))
    bench("oniguruma: BASH", () => do_not_optimize(oni(BASH, "bash")))
    bench("javascript: BASH", () => do_not_optimize(js(BASH, "bash")))
  })
})

// No `run()` call here — the `z bench` runner (`packages/dev/src/bench.ts`)
// imports every `*.bench.ts` file and calls `run()` once at the end so
// all benches print a combined report.
