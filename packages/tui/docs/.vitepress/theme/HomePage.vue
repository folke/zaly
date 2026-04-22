<script setup lang="ts">
import { onMounted, ref } from "vue"

// The hero "terminal" runs through a realistic session on mount:
//
//   1. idle          — just the agent panel + empty input prompt
//   2. typing        — character-by-character reveal of the query
//   3. submit        — query moves into stream history, input clears
//   4. streaming     — response rows appear one by one
//
// All timing uses plain setTimeouts — no animation framework, no deps.

const QUERY = "explain @src/renderer"

// Character count currently rendered in the input row during typing.
const typed = ref(0)
// How many stream rows are currently revealed, counted from top. The
// stream area is bottom-anchored: new rows grow at the bottom and
// push older ones upward (same way a real terminal scroll behaves).
//
//   0 — empty stream
//   1 — user query row
//   2 — blank separator
//   3 — "the renderer owns three surfaces:"
//   4 — "● stream"
//   5 — "● ui"
//   6 — "● overlay"
const streamRows = ref(0)

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

onMounted(async () => {
  await sleep(600) // phase 1: settle
  // phase 2: type query
  for (let i = 1; i <= QUERY.length; i++) {
    typed.value = i
    await sleep(38 + Math.random() * 40)
  }
  await sleep(420) // pause on full query before submitting
  // phase 3: submit + assistant reply — rows grow in at the bottom.
  for (let i = 1; i <= 6; i++) {
    streamRows.value = i
    await sleep(i === 1 ? 360 : 220)
  }
})
</script>

<template>
  <main class="zhome">
    <div class="scroll-crop">
      <!-- HERO ---------------------------------------------------------- -->
      <section class="hero">
        <div class="hero-text">
          <div class="tagline">
            <span class="bracket">[</span>
            <span>v0.0.0 · direct-mode tui</span>
            <span class="bracket">]</span>
          </div>
          <h1>The terminal UI<span class="italic"> for agents</span></h1>
          <p class="lede">
            Rows to stdout, signals for state, and the terminal's own scrollback for history. Built
            for agent interfaces.
          </p>
          <div class="ctas">
            <a class="btn primary" href="/guide/getting-started">
              <span class="chev">&gt;</span> get started
            </a>
            <a class="btn" href="/api/"> api reference </a>
            <a class="btn ghost" href="https://github.com/folke/zaly"> github → </a>
          </div>
          <div class="install">
            <span class="prompt">$</span>
            <span class="cmd">bun add @zaly/tui</span>
            <span class="cursor"></span>
          </div>
        </div>

        <!-- Fake-terminal rendering a mini TUI. Rows reveal sequentially. -->
        <aside class="terminal" aria-hidden="true">
          <div class="tchrome">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="ttitle">zaly — demo</span>
          </div>
          <!-- eslint-disable prettier/prettier vue/singleline-html-element-content-newline -->
          <!-- Rows must stay on single lines so inter-span spaces don't
               get collapsed by Vue's whitespace handling. -->
          <!-- Terminal is laid out like a real session: agent panel
               pinned at top, history scrolls in the middle, input stays
               at the bottom. Rows are always in the DOM with opacity
               gating so the box doesn't grow/shrink during the reveal. -->
          <div class="ttty">
            <!-- Stream area is bottom-anchored via flexbox. Each revealed
                 row grows its own max-height from 0 → natural, so older
                 rows shift upward as new ones arrive — exactly like a
                 real terminal pushing scrollback up. -->
            <div class="stream-area">
              <fieldset class="tbox on">
                <legend><span class="tb">zaly agent</span></legend>
                <div class="tbox-row on">
                  <span class="muted">super-model</span> <span class="faint">·</span>
                  <span class="ok">ready</span>
                </div>
              </fieldset>
              <!-- Blank above the user row appears together with the
                   user row itself — otherwise the question shows up
                   flush against the agent panel for one tick and then
                   pops apart when the blank grows in. -->
              <div class="row blank" :class="{ on: streamRows >= 0 }">&nbsp;</div>
              <div class="row user" :class="{ on: streamRows >= 1 }">
                <span class="accent">❯</span> explain <span class="accent">@src/renderer</span>
              </div>
              <div class="row blank" :class="{ on: streamRows >= 2 }">&nbsp;</div>
              <div class="row" :class="{ on: streamRows >= 3 }">
                <span class="accent">●</span
                ><span class="faint"> the renderer owns three surfaces:</span>
              </div>
              <div class="row" :class="{ on: streamRows >= 4 }">
                &nbsp;&nbsp;<span class="accent">●</span>
                <span class="bold"> stream</span>&nbsp;&nbsp;&nbsp;<span class="faint"
                  >scroll region</span
                >
              </div>
              <div class="row" :class="{ on: streamRows >= 5 }">
                &nbsp;&nbsp;<span class="accent">●</span>
                <span class="bold"> ui</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span
                  class="faint"
                  >sticky footer</span
                >
              </div>
              <div class="row" :class="{ on: streamRows >= 6 }">
                &nbsp;&nbsp;<span class="accent">●</span>
                <span class="bold"> overlay</span>&nbsp;&nbsp;<span class="faint">absolute</span>
              </div>
              <div class="row blank" :class="{ on: streamRows >= 1 }">&nbsp;</div>
            </div>

            <!-- Input row stays pinned at the bottom. During typing it
                 shows the partial query; once submitted the text moves
                 into the stream above and the prompt clears. -->
            <div class="row input-row on">
              <span class="accent">❯ </span>
              <span v-if="streamRows === 0" class="typed">{{ QUERY.slice(0, typed) }}</span>
              <span class="block-cursor">█</span>
            </div>
          </div>
        </aside>
      </section>

      <!-- MANIFEST / HORIZONTAL META STRIP ------------------------------ -->
      <section class="strip">
        <div class="strip-cell">
          <div class="k">runtime</div>
          <div class="v">bun · node 24+</div>
        </div>
        <div class="strip-cell">
          <div class="k">size</div>
          <div class="v">single package</div>
        </div>
        <div class="strip-cell">
          <div class="k">deps</div>
          <div class="v">marked · shiki</div>
        </div>
        <div class="strip-cell">
          <div class="k">license</div>
          <div class="v">apache-2.0</div>
        </div>
      </section>

      <!-- FEATURES ------------------------------------------------------ -->
      <section class="features">
        <header class="sec-head">
          <span class="lbl">features.md</span>
          <span class="rule"></span>
        </header>
        <div class="grid">
          <article class="card">
            <div class="idx">01</div>
            <h3>Direct-mode rendering</h3>
            <p>
              Writes whole rows to stdout. Terminal scrollback keeps your history.
              <code>DECSTBM</code> pins the footer; everything above flows naturally. No VDOM, no
              patches.
            </p>
          </article>
          <article class="card">
            <div class="idx">02</div>
            <h3>Three surfaces</h3>
            <p>
              <code>stream</code> for history, <code>ui</code> for sticky chrome,
              <code>overlay</code> for modals. Each paints inside one synchronized-output bracket
              per tick — no flicker.
            </p>
          </article>
          <article class="card">
            <div class="idx">03</div>
            <h3>Fine-grained reactivity</h3>
            <p>
              Solid-style signals. <code>AsyncLocalStorage</code>
              tracking across awaits. ~100 lines of runtime. Auto-subscribe inside widget renders.
            </p>
          </article>
          <article class="card">
            <div class="idx">04</div>
            <h3>Batteries included</h3>
            <p>
              Markdown with shiki, diff, code, input, menu, autocomplete, progress, spinner,
              overlays, Kitty-graphics images. Every widget themeable via slots.
            </p>
          </article>
        </div>
      </section>

      <!-- CODE SAMPLE --------------------------------------------------- -->
      <section class="sample">
        <header class="sec-head">
          <span class="lbl">hello.ts</span>
          <span class="rule"></span>
        </header>
        <div class="sample-inner">
          <pre><code><span class="k-kw">import</span> { box, createRenderer, input, markdown, text } <span class="k-kw">from</span> <span class="k-str">"@zaly/tui"</span>

<span class="k-kw">const</span> r <span class="k-op">=</span> <span class="k-fn">createRenderer</span>()

r.ui.<span class="k-fn">add</span>(
  <span class="k-fn">box</span>(
    { bg: <span class="k-str">"bg"</span>, flexDirection: <span class="k-str">"column"</span>, padding: [<span class="k-num">0</span>, <span class="k-num">1</span>] },
    <span class="k-fn">text</span>(({ style }) <span class="k-op">=&gt;</span> style.<span class="k-fn">dim</span>(<span class="k-str">"enter to send · ctrl-c to quit"</span>)),
    <span class="k-fn">box</span>(
      { flexDirection: <span class="k-str">"row"</span>, gap: <span class="k-num">1</span> },
      <span class="k-fn">text</span>(({ style }) <span class="k-op">=&gt;</span> style.<span class="k-fn">primary</span>(<span class="k-str">"❯"</span>), { width: <span class="k-num">1</span> }),
      <span class="k-fn">input</span>({ placeholder: <span class="k-str">"type a message…"</span> })
        .<span class="k-fn">focus</span>()
        .<span class="k-fn">on</span>(<span class="k-str">"submit"</span>, (value, self) <span class="k-op">=&gt;</span> {
          r.stream.<span class="k-fn">append</span>(<span class="k-fn">markdown</span>(<span class="k-str">`**you:** </span><span class="k-op">${</span>value<span class="k-op">}</span><span class="k-str">`</span>))
          self.<span class="k-fn">setState</span>({ cursor: <span class="k-num">0</span>, value: <span class="k-str">""</span> })
        }),
    ),
  ),
)

r.<span class="k-fn">start</span>()</code></pre>
          <p class="caption">
            That's a full echo chat. <span class="italic">ctrl-c to quit</span> is the default
            binding; scrollback keeps history; footer reflows on resize.
          </p>
        </div>
      </section>

      <!-- FOOT ---------------------------------------------------------- -->
      <section class="foot">
        <div class="foot-big"><span class="chev">&gt;</span> ready to build?</div>
        <div class="foot-ctas">
          <a class="btn primary" href="/guide/getting-started">start the guide</a>
          <a class="btn ghost" href="/api/">read the api</a>
        </div>
        <div class="foot-meta">
          <span>zaly/tui</span>
          <span>·</span>
          <span>apache-2.0</span>
          <span>·</span>
          <span>folke lemaitre</span>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.zhome {
  font-family: var(--vp-font-family-base);
  color: var(--z-ink);
  background: var(--z-paper);
  font-feature-settings: "ss01", "ss02", "cv11";
}

.scroll-crop {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 clamp(16px, 3vw, 48px);
}

/* ---------- HERO ---------- */
.hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(32px, 4vw, 64px);
  padding: clamp(48px, 8vw, 112px) 0 clamp(48px, 7vw, 96px);
  align-items: center;
}

@media (max-width: 900px) {
  .hero {
    grid-template-columns: 1fr;
  }
}

.tagline {
  display: inline-flex;
  gap: 6px;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--z-ink-muted);
  margin-bottom: 24px;
  text-transform: uppercase;
}
.tagline .bracket {
  color: var(--z-accent);
}

.hero h1 {
  font-size: clamp(40px, 5.5vw, 68px);
  line-height: 1.02;
  font-weight: 500;
  letter-spacing: -0.015em;
  margin: 0 0 28px;
  word-spacing: -0.25em;
}
.hero h1 span {
  letter-spacing: -0.015em;
  word-spacing: 0.15em;
}

.italic {
  font-family: var(--z-font-display);
  font-weight: 400;
  font-style: italic;
  letter-spacing: 0;
  color: var(--z-accent);
}

.lede {
  font-size: 15px;
  line-height: 1.55;
  color: var(--z-ink-muted);
  max-width: 46ch;
  margin: 0 0 36px;
}

.ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 28px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--z-rule-strong);
  background: transparent;
  color: var(--z-ink);
  border-radius: 0; /* sharp corners, no rounding */
  text-decoration: none;
  transition:
    background-color 120ms,
    color 120ms,
    border-color 120ms;
}
.btn:hover {
  background: var(--z-ink);
  color: var(--z-paper);
  border-color: var(--z-ink);
}
.btn.primary {
  background: var(--z-accent);
  color: #00171f;
  border-color: var(--z-accent);
}
.btn.primary:hover {
  background: var(--z-ink);
  color: var(--z-accent);
  border-color: var(--z-ink);
}
.btn.ghost {
  border-color: transparent;
  color: var(--z-ink-muted);
}
.btn.ghost:hover {
  background: transparent;
  color: var(--z-ink);
  text-decoration: underline;
  text-underline-offset: 4px;
}
.btn .chev {
  color: var(--z-accent);
  font-weight: 700;
}
.btn.primary .chev {
  color: currentColor;
}

.install {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--z-paper-raised);
  border: 1px solid var(--z-rule);
  font-size: 13px;
}
.install .prompt {
  color: var(--z-accent);
  font-weight: 700;
}
.install .cmd {
  color: var(--z-ink);
}

@keyframes blink {
  0%,
  60% {
    opacity: 1;
  }
  61%,
  100% {
    opacity: 0;
  }
}

/* ---------- FAKE TERMINAL ---------- */
.terminal {
  background: var(--z-paper-raised);
  border: 1px solid var(--z-rule);
  position: relative;
  overflow: hidden;
  box-shadow:
    0 1px 0 var(--z-rule),
    0 20px 40px -20px rgba(0, 0, 0, 0.15);
}
.dark .terminal {
  box-shadow: 0 20px 40px -20px rgba(0, 0, 0, 0.6);
}

.tchrome {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--z-rule);
  font-size: 11px;
  color: var(--z-ink-faint);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.tchrome .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--z-rule-strong);
}
.tchrome .ttitle {
  margin-left: auto;
}

.ttty {
  padding: 20px 22px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.55;
  color: var(--z-ink);
  overflow-x: auto;
}
.ttty .row {
  white-space: pre;
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 260ms,
    transform 260ms;
}
.ttty .row.on {
  opacity: 1;
  transform: translateY(0);
}

/* The user-history row has a two-step entrance: first it appears at
 * the bottom of the stream area (next to where the input was), then
 * it slides up to its natural position. The Y offset approximates the
 * height of the response rows + blanks between user row and input. */
/* Bottom-anchored stream. Rows inside grow from 0 to natural height,
 * so each reveal pushes older rows up and the newest row emerges at
 * the bottom — same behaviour as a real terminal's scrollback. */
.ttty {
  display: flex;
  flex-direction: column;
}
.ttty .stream-area {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 210px; /* reserve space so the terminal doesn't shrink */
  overflow: hidden;
}
.ttty .stream-area .row {
  max-height: 0;
  overflow: hidden;
  transition:
    max-height 280ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 200ms 80ms;
}
.ttty .stream-area .row.on {
  max-height: 1.55em; /* one line-height */
}

.ttty .accent {
  color: var(--z-accent);
}
.ttty .tb {
  color: var(--z-accent);
  font-weight: 600;
}

/* Panel rendered with real CSS borders — legend sits inside the top edge. */
.ttty .tbox {
  border: 1px solid var(--z-accent);
  padding: 8px 12px;
  margin: 0 0 0;
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 260ms,
    transform 260ms;
}
.ttty .tbox.on {
  opacity: 1;
  transform: translateY(0);
}
.ttty .tbox legend {
  padding: 0 6px;
  font-size: 12px;
  line-height: 1;
}
.ttty .tbox .tbox-row {
  white-space: pre;
  opacity: 0;
  transition: opacity 260ms;
}
.ttty .tbox .tbox-row.on {
  opacity: 1;
}
.ttty .muted {
  color: var(--z-ink-muted);
}
.ttty .faint {
  color: var(--z-ink-faint);
}
.ttty .ok {
  color: #10b981;
}
.ttty .bold {
  font-weight: 600;
}
.ttty .block-cursor {
  background: var(--z-accent);
  color: var(--z-accent);
  animation: blink 1.1s steps(1) infinite;
}
.ttty .input-row {
  border-top: 1px solid var(--z-accent);
  padding-top: 8px;
}

/* ---------- META STRIP ---------- */
.strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--z-rule-strong);
  border-bottom: 1px solid var(--z-rule-strong);
  margin: 0 0 clamp(48px, 6vw, 96px);
}
@media (max-width: 720px) {
  .strip {
    grid-template-columns: repeat(2, 1fr);
  }
}
.strip-cell {
  padding: 20px 24px;
  border-right: 1px solid var(--z-rule);
}
.strip-cell:last-child {
  border-right: none;
}
.strip-cell .k {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--z-ink-faint);
  margin-bottom: 6px;
}
.strip-cell .v {
  font-size: 14px;
  color: var(--z-ink);
}

/* ---------- SECTION HEADS ---------- */
.sec-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}
.sec-head .lbl {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--z-ink-faint);
}
.sec-head .rule {
  flex: 1;
  height: 1px;
  background: var(--z-rule);
}

/* ---------- FEATURES ---------- */
.features {
  padding: 0 0 clamp(48px, 6vw, 96px);
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--z-rule);
  border-left: 1px solid var(--z-rule);
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 540px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.card {
  padding: 28px 24px;
  border-right: 1px solid var(--z-rule);
  border-bottom: 1px solid var(--z-rule);
  background: var(--z-paper-raised);
  position: relative;
  transition: background-color 180ms;
}
.card:hover {
  background: var(--z-paper);
}
.card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--z-accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 260ms;
}
.card:hover::before {
  transform: scaleX(1);
}

.idx {
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--z-accent);
  margin-bottom: 20px;
}
.card h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 10px;
  letter-spacing: -0.005em;
  color: var(--z-ink);
}
.card p {
  font-size: 13px;
  line-height: 1.55;
  color: var(--z-ink-muted);
  margin: 0;
}
.card code {
  font-family: var(--vp-font-family-mono);
  background: var(--z-accent-soft);
  color: var(--z-accent);
  padding: 1px 5px;
  font-size: 12px;
}

/* ---------- CODE SAMPLE ---------- */
.sample {
  padding: 0 0 clamp(48px, 6vw, 96px);
}
.sample-inner {
  background: var(--z-paper-raised);
  border: 1px solid var(--z-rule);
  padding: 28px 32px;
}
.sample pre {
  margin: 0 0 24px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.65;
  color: var(--z-ink);
  overflow-x: auto;
}
.sample pre code {
  color: inherit;
  background: none;
  padding: 0;
}
.sample .caption {
  font-size: 13px;
  color: var(--z-ink-muted);
  margin: 0;
  padding-top: 16px;
  border-top: 1px dashed var(--z-rule);
}

/* Code-sample token colors — deliberately minimal, to match the ink/accent vocabulary */
.k-kw {
  color: var(--z-accent);
}
.k-fn {
  color: var(--z-ink);
  font-weight: 500;
}
.k-str {
  color: var(--z-ink-muted);
}
.k-num {
  color: var(--z-ink-muted);
}
.k-op {
  color: var(--z-ink-faint);
}

/* ---------- FOOT ---------- */
.foot {
  padding: clamp(64px, 10vw, 128px) 0;
  text-align: left;
  border-top: 1px solid var(--z-rule-strong);
}
.foot-big {
  font-size: clamp(40px, 5vw, 64px);
  font-weight: 500;
  letter-spacing: -0.015em;
  margin-bottom: 32px;
}
.foot-big .chev {
  color: var(--z-accent);
  font-weight: 700;
}
.foot-ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 32px;
}
.foot-meta {
  display: flex;
  gap: 10px;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--z-ink-faint);
  text-transform: uppercase;
}
</style>
