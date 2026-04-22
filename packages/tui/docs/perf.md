# @zaly/tui — performance notes

Unbenchmarked, design-level notes. See *Next* section for what to actually
measure before making any perf claims in release notes.

## Strong by design

- **Streaming appends.** The Stream surface is literally shaped for this:
  per-node row cache, microtask coalesce, one `terminal.sync()` block per
  tick, string-equality row diff. No reconciler. `allRows.slice(newCC)` +
  diff is orders of magnitude less work than ink's React reconcile +
  Yoga cross-WASM per tick.
- **Small trees, frequent updates.** Cache hits on unchanged subtrees
  short-circuit re-rendering. A typical footer (spinner + status + input)
  is a handful of nodes with stable ctxHash between ticks.
- **Memory.** No React runtime. No Yoga WASM. Shiki is the heaviest
  dep and lazy-loads a shared singleton. Stream surface keeps only the
  last `maxLive` (default 3) nodes plus any whose rows remain
  on-screen — prior messages live in the terminal's own scrollback, not
  in our process memory. Alt-screen frameworks can't use terminal
  scrollback, so they tend to buffer message history themselves.
- **Startup.** JS parse + our bootstrap. Faster than React-based
  frameworks. Shiki + `image-meta` + sharp load lazily on first use.

## Likely slower than competitors

- **Complex grid layouts.** We hand-rolled a flex subset. ink uses
  Yoga (C++ via WASM). For heavy grid/table layouts Yoga wins.
- **Full-screen dashboards.** Not the target. blessed / ink are mature
  here.

## Perf smells (to profile and likely fix)

1. **`ctxHash` uses sha256.** Crypto hash is wild overkill for a
   tree-walk cache key. Plain `${theme-identity}|${width}` string
   concat would be 10–20× faster. Or: drop per-render hashing entirely
   and do explicit invalidate-on-resize / invalidate-on-theme-swap
   walks from the Renderer root.
2. **`StyleBuilder` allocates a `Proxy` per property access.**
   `style.red.bold.bg("muted")` = 3 Proxies. Hot in any node that
   emits styled spans. Options: pool + reset, or give up immutability
   and use a mutable-then-freeze pattern.
3. **`resolveColor` string-parses `/alpha` and `-step` on every SGR
   emission.** Cache `"primary-300/20"` → final hex at theme-binding
   time; invalidate on theme change.
4. **`reapplyStyle` uses `String.prototype.replaceAll(RESET, …)`.** Fine
   for short strings, measurable on tall styled Text rows. A manual
   single-pass scan is straightforward.
5. **`splitAnsi` routes through `sliceAnsi` per line.** Every cut
   reparses SGR state. For our own emissions we know the SGR shape —
   could fast-path common cases (plain rows, single-SGR rows).
6. **`Promise.all` + microtask chain in `Renderer.render`.** Handful
   of awaits per tick. Measurable overhead at high tick rates, but
   probably not dominant.

## Ranking guesses (agent-harness workload: 20–60 tokens/sec markdown +
shiki + UI + overlay)

- **@zaly/tui** — well-positioned. Cache-friendly, minimal per-tick
  allocation if we address the low-hanging items above.
- **opentui** — closest peer. Signals + fine-grained reactivity suits
  this workload. Probably comparable post-optimization.
- **ink** — React batching helps on large updates, but per-tick
  reconcile adds up at streaming frequencies.
- **blessed** — procedural, minimal caching. Probably slowest on this
  specific workload.

## Next — what to actually measure

Run these against `ink` equivalents and publish the numbers before
making any perf claims.

1. **Streaming markdown.** Append-and-mutate one markdown node at 60
   tokens/sec for 30s. Measure ticks/sec, p95 tick duration, GC.
2. **Plain stream throughput.** Append N text rows as fast as
   possible, measure rows/sec.
3. **StyleBuilder microbench.** `style().red.bold.bg("muted")("hi")`
   in a tight loop — ops/sec.
4. **Theme resolution microbench.** `colorParams("primary-300/20", "bg",
   moon)` — ops/sec.
5. **Tree render (cache hit path).** Render a 50-node tree with no
   state changes — should be near-free.
6. **Resize.** Trigger SIGWINCH on a populated tree; measure full
   repaint latency.

### Benchmarking tool

**mitata** over tinybench for these:

- Bun-native, no extra runtime hop.
- Statistically rigorous (timer-overhead correction, warmup, outlier
  rejection).
- Tight enough output for microbench noise to be meaningful.

tinybench would also work and has a simpler API — fine for anything
above ~100ns/op. mitata's advantage is on the really-fast paths
(StyleBuilder, ctxHash replacements) where timer overhead matters.

```sh
bun add -d mitata
```

Put benches under `packages/tui/bench/*.bench.ts` and wire `bun bench`
to run them.
