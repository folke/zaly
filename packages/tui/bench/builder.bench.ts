/**
 * StyleBuilder microbench.
 *
 *     bun bench/builder.bench.ts
 *
 * Each `bench` block is one hot path a typical render will hit. If a path
 * is on the order of tens of microseconds, consider: pooling the Proxy
 * chain, caching resolved openStyle runs per Style key, folding the
 * chain's property accesses into a single apply.
 */

import { barplot, bench, summary } from "mitata"
import { styleBuilder } from "../src/style/builder.ts"
import { defaultTheme } from "../src/themes/registry.ts"

const s = styleBuilder(defaultTheme)

barplot(async () => {
  summary(async () => {
    // Baseline: bare call, no styling. Gives us the pure proxy overhead.
    bench("style()('hi')", () => styleBuilder()("hi"))

    // Single fg via theme slot. Common in text widgets.
    bench("style.primary('hi')", () => s.primary("hi"))

    // Direct ANSI color, skips theme resolve.
    bench("style.red('hi')", () => s.red("hi"))

    // Single attr.
    bench("style.bold('hi')", () => s.bold("hi"))

    // Typical "styled prose" chain: attr + fg slot.
    bench("style.bold.primary('hi')", () => s.bold.primary("hi"))

    // Deep chain — 3 accesses + apply.
    bench("style.bold.italic.underline.primary('hi')", () => s.bold.italic.underline.primary("hi"))

    // bgFoo + fgFoo extraction from a Style slot (diff-widget path).
    bench("style.bgPrimary.fgAccent('hi')", () => s.bgPrimary.fgAccent("hi"))

    // Variant + alpha (tonal + blend against theme.bg).
    bench("style.primary.lighten(20)('hi')", () => s.primary.lighten(20)("hi"))

    // `add` path — merges a slot's Style via resolveStyle.
    bench("style.add('border')('hi')", () => s.add("border")("hi"))

    // `add` path — merges a slot's Style via resolveStyle.
    bench("style.border('hi')", () => s.border("hi"))

    // Fully bound (no extra chain calls at render time) — shows how
    // effective pre-binding is vs per-call chains.
    const preBound = s.bold.primary
    bench("pre-bound fg+bold('hi')", () => preBound("hi"))

    // Longer content — same chain, just measures content scaling.
    const long = "lorem ipsum dolor sit amet, ".repeat(8)
    bench("style.bold.primary(LONG)", () => s.bold.primary(long))

    // Content with inner SGR (simulates shiki-styled tokens). Exercises
    // the reapplyStyle `replaceAll` in the apply closure.
    const withInner = `\x1b[38;2;130;170;255mtok\x1b[0m ${s.bold("x")} \x1b[38;2;255;117;127mtok\x1b[0m`
    bench("style.bold.primary(CONTENT_WITH_INNER_SGR)", () => s.bold.primary(withInner))
  })
})
