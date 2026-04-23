import { box, code, createCtx, loadTheme, text } from "../src/index.ts"

const samples = [
  {
    code: `import { createRenderer, text } from "@zaly/tui"

const r = createRenderer()
r.start()
r.stream.append(text("hello from zaly"))`,
    lang: "ts",
    title: "greeting.ts",
  },
  {
    code: `SELECT id, email, last_login
FROM users
WHERE created_at > now() - interval '30 days'
ORDER BY last_login DESC
LIMIT 10;`,
    lang: "sql",
    title: "recent-logins.sql",
  },
  {
    code: `#!/usr/bin/env bash
set -euo pipefail

for f in *.log; do
  grep -E 'ERROR|WARN' "$f" || true
done`,
    lang: "bash",
    // No title — plain block.
  },
  {
    code: `{"name": "zaly", "version": "0.0.0"}`,
    // No lang — plain backdrop, no syntax colors.
    title: "package.json (unknown lang)",
  },
]

const theme = await loadTheme("catppuccin-mocha")
const ctx = createCtx({ theme, width: 80 })

const column = (sample: (typeof samples)[number]) =>
  box({ flexDirection: "column", padding: [0, 0, 1, 0] }, code(sample))

const heading = (s: string) => text(({ style }) => style.primary(s), { wrap: "none" })

const app = box(
  { flexDirection: "column", gap: 1, padding: [1, 1] },
  heading("@zaly/tui — code() demo"),
  ...samples.map(column)
)

const rendered = await app.render(ctx)
console.log(rendered.join("\n"))
