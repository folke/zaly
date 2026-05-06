# autocomplete

A popup bound to an [`input`](./input). Watches the input's value + cursor; when a source's trigger regex matches, the source's `complete` runs and its results show in a `Menu` child. Selecting an item calls the source's `accept` hook.

## Example

```ts
import { actionsSource, autocomplete, filesSource, githubSource } from "@zaly/tui"

autocomplete({
  input: "chat-input",
  maxHeight: 8,
  sources: {
    slash: actionsSource({ actions: renderer.actions }),
    files: filesSource(),
    gh: githubSource(),
  },
})
```

## Options

| field       | type                               | default | description                                                                                    |
| ----------- | ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `input`     | `Input \| string`                  | —       | The bound input. String form resolves through `ctx.getNode(id)` on mount.                      |
| `sources`   | `Record<string, CompletionSource>` | —       | Keyed completion sources. First source whose trigger matches and query has no whitespace wins. |
| `maxHeight` | `number`                           | `8`     | Popup row cap.                                                                                 |

## Events

| event            | payload                           | when                                                                                                                    |
| ---------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `open` / `close` | —                                 | Popup visibility flipped.                                                                                               |
| `complete`       | `[source: string, item: unknown]` | User selected an item. Payload `item` is `unknown` because sources may use different `T` — discriminate by source name. |

## CompletionSource

```ts
interface CompletionSource<T = MenuItem> {
  triggers: readonly RegExp[]
  complete: (query: string, match: Matcher) => T[] | Promise<T[]>
  accept?: (item: T, query: string) => string | undefined
  render?: MenuRender<T>
}

type Matcher = (s: string) => number // 0 = no match, >0 = score
```

- **triggers** — regexes run against text _before the cursor_. Latest matching trigger wins. Use lookbehind (`(?<=^|\s)@`) when you don't want the trigger character itself to be replaced on accept.
- **complete** — called when a trigger matches. Receives the raw `query` (text after trigger end, up to cursor) and a `match` helper bound to that query.
- **accept** — run on selection. Return a string to insert (replacing trigger + query range); return `undefined` to clear the range without inserting (the source handled the action itself, e.g. dispatched a command).
- **render** — optional per-row renderer, forwarded to the internal Menu. Lets the source carry its own layout when `T` isn't `MenuItem`-shaped.

### The `match` helper

Sources choose _what_ to match against — action id, file basename, contact email, issue title. The widget owns the _algorithm_ (default: fuzzy subsequence). Sources call `match(str)` and either filter (`.filter(item => match(item.name))` — zero is falsy) or sort (score is a positive integer when it matches).

> [!NOTE]
> Results preserve source order by default — no re-ranking on keystroke. That avoids the menu jumping around as users narrow the filter. Opt into ranking with the `rank()` helper.

## Built-in sources

### `actionsSource({ actions, trigger?, filter? })`

Slash-command completion backed by the `Actions` registry.

- Items: `ActionInfo & { id }` — no wrapper type.
- Fuzzy-matches on `info.name ?? id`.
- `accept` dispatches the action and returns `undefined`, so the typed `/foo` is erased after the action fires.

```ts
actionsSource({
  actions: renderer.actions,
  filter: (_id, info) => !info.hidden, // default
})
```

### `filesSource({ cwd?, trigger?, prefix?, filter?, limit? })`

File path completion against the filesystem.

- Splits the query at the last `/` — dir prefix is literal, basename is fuzzy-matched.
- Dirs render with a trailing `/` so users can keep typing to drill in. Picking a dir keeps the popup open; picking a file appends a trailing space so it closes.
- `accept` returns `prefix + value` so the trigger char (default `@`) stays in the input.

```ts
filesSource({
  cwd: process.cwd(),
  filter: (ent) => !ent.name.startsWith("."), // default: skip dotfiles
  limit: 50,
})
```

### `githubSource({ cwd?, trigger?, prefix?, state?, limit?, fetcher? })`

Issue / PR completion via the `gh` CLI.

- Fetches `gh issue list` + `gh pr list` in parallel on first use and caches. Rapid keystrokes share the in-flight Promise.
- Matches on `"#<num> <title>"` so digits or words both work.
- `accept` inserts `#123 ` — markdown-ready.

```ts
githubSource({ state: "open" }) // default
```

> [!TIP]
> Silently returns `[]` when `gh` is missing, unauthenticated, or the dir isn't a GitHub repo — safe to wire up unconditionally.

## Notes

- Positioning is layout-based — place the autocomplete inside your UI footer (typically directly above the input). When no trigger matches, `state.visible` flips to `false` and the widget takes zero rows, collapsing the footer.
- The internal Menu runs in `sticky: true` mode so the popup doesn't jitter while the user narrows candidates. On close, `menu.resetHeight()` is called so the next open starts at its natural size.
