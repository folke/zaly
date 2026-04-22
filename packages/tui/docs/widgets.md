# Widget Backlog

Widgets `@zaly/tui` should grow to support an agent-harness UI like Zaly. Not a
commitment — a ranked shortlist to pull from when a concrete need surfaces.

## High value

### Autocomplete popover
Slash commands, `@`-mentions, file paths. Anchors to an input, keyboard nav,
async suggestion provider. One widget covers all three usages.

- Built on the Overlay surface (no scrollback pollution).
- Accepts a `(query) => Promise<Item[]>` provider.
- Emits `select` with the chosen item.
- Kbd: arrows to move, enter to pick, esc to close.

### Select / Confirm
Single-choice picker and its yes/no degenerate case. Used for tool-approval
prompts and destructive-action gates.

- `confirm(message)` → `Promise<boolean>` — sugar over `select`.
- `select({ items, message })` → `Promise<Item>`.
- Overlay-positioned, blocks until resolved.

### Log panel
Toggleable panel that mirrors `console.*` output. Mainly for debugging agent
flows and widget internals.

- Captures `console.log/warn/error/debug` into a ring buffer.
- Toggled with a keybind (e.g. ctrl-L); hidden by default.
- Renders newest-at-bottom, auto-scrolls, levels colored.
- Keep it surface-agnostic — likely an Overlay when open.

## Nice to have

### Collapsible / disclosure
One-line summary with an expand affordance. Long tool outputs and tracebacks
get noisy fast; collapsing them restores scan-ability.

### Multi-select / checklist
"Which files to include?" style prompts; batch tool approvals. Same shell as
`select` with a different selection model.

### Table
Column-sized rendering for tool results and file listings. Markdown has
inline tables but no first-class widget with alignment + truncation.

## Defer until needed

- **Toast / transient notification** — "copied", "saved". Overlay already
  supports one-shot paint; widget is thin, wait for a use case.
- **Tabs** — multiple conversations / logs side-by-side. YAGNI until the
  product asks for it.

## Not in `@zaly/tui`

- **Bottom statusline** — Zaly-specific composition, not a reusable widget.
  Builds on existing `box` + `text` just fine.

## Current order

1. Autocomplete
2. Select / Confirm
3. Log panel
4. Collapsible
