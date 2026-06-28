/** Styled HTML returned to the browser after the OAuth callback.
 *
 *  Matches the look of `packages/tui/docs/.vitepress/theme/HomePage.vue`:
 *  off-white paper, JetBrains Mono base + Instrument Serif italic for
 *  the headline, cyan accent (`#07b5ef` light / `#5dd4ff` dark), thin
 *  rules, square-bracket tagline. The whole page is ~3KB inline so the
 *  user sees it instantly even on a flaky network. */

type PageOpts = {
  tagline: string
  heading: string
  italic: string
  body: string
  /** Tone — drives the accent color used for the headline and rule. */
  tone: "ok" | "error"
}

function page(opts: PageOpts): string {
  const accent = opts.tone === "ok" ? "#07b5ef" : "#ef4444"
  const accentDark = opts.tone === "ok" ? "#5dd4ff" : "#f87171"
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${opts.tagline}</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap" rel="stylesheet" />
<style>
  :root {
    --z-accent: ${accent};
    --z-ink: rgb(24,24,27);
    --z-ink-muted: rgb(113,113,122);
    --z-ink-faint: rgb(161,161,170);
    --z-paper: #fafaf8;
    --z-rule: rgba(24,24,27,0.12);
    --z-rule-strong: rgba(24,24,27,0.28);
    --z-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    --z-display: "Instrument Serif", "JetBrains Mono", serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --z-accent: ${accentDark};
      --z-ink: rgb(228,228,231);
      --z-ink-muted: rgb(161,161,170);
      --z-ink-faint: rgb(113,113,122);
      --z-paper: #0a0a0a;
      --z-rule: rgba(228,228,231,0.10);
      --z-rule-strong: rgba(228,228,231,0.22);
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: var(--z-mono);
    color: var(--z-ink);
    background: var(--z-paper);
    font-feature-settings: "ss01","ss02","cv11";
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 4rem 1.5rem;
  }
  main {
    max-width: 36rem;
    width: 100%;
  }
  .tagline {
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--z-ink-muted);
    margin-bottom: 1.25rem;
  }
  .tagline .bracket { color: var(--z-accent); margin: 0 0.4rem; }
  h1 {
    font-family: var(--z-mono);
    font-weight: 600;
    font-size: clamp(2.25rem, 6vw, 3.4rem);
    line-height: 1.05;
    letter-spacing: -0.01em;
    margin: 0 0 1.5rem;
  }
  h1 .italic {
    font-family: var(--z-display);
    font-style: italic;
    font-weight: 400;
    color: var(--z-accent);
  }
  .lede {
    color: var(--z-ink-muted);
    line-height: 1.6;
    margin: 0 0 2rem;
    max-width: 30rem;
  }
  .rule {
    height: 1px;
    background: var(--z-rule);
    margin: 2rem 0;
  }
  .meta {
    font-size: 0.78rem;
    color: var(--z-ink-faint);
    letter-spacing: 0.04em;
  }
  code {
    font-family: var(--z-mono);
    color: var(--z-accent);
  }
</style>
</head>
<body>
<main>
  <div class="tagline">
    <span class="bracket">[</span>
    <span>${opts.tagline}</span>
    <span class="bracket">]</span>
  </div>
  <h1>${opts.heading}<span class="italic"> ${opts.italic}</span></h1>
  <p class="lede">${opts.body}</p>
  <div class="rule"></div>
  <p class="meta">you can close this window — return to your terminal</p>
</main>
</body>
</html>
`
}

export function oauthSuccessPage(provider: string): string {
  return page({
    body: `Your ${provider} account is now linked to zaly. The terminal will pick up your new credentials automatically.`,
    heading: "Authorized.",
    italic: "you're in.",
    tagline: `zaly · ${provider}`,
    tone: "ok",
  })
}

export function oauthErrorPage(provider: string, error: string): string {
  return page({
    body: error,
    heading: "Login failed.",
    italic: "try again.",
    tagline: `zaly · ${provider}`,
    tone: "error",
  })
}

export function oauthPages(provider: string) {
  return {
    error: (error: string) => oauthErrorPage(provider, error),
    success: () => oauthSuccessPage(provider),
  }
}
