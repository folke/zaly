# diff

Render a set of line-range edits against an original file as a unified diff with optional syntax highlighting.

## Example

```ts
import { diff } from "@zaly/tui"

diff({
  title: "src/greet.ts",
  lang: "typescript",
  original: "export function greet(name) {\n  return 'hi ' + name\n}\n",
  edits: [
    {
      from: 0,
      to: 1,
      replacement: ["export function greet(name: string) {"],
    },
  ],
})
```

## State

| field                  | type         | default | description                                               |
| ---------------------- | ------------ | ------- | --------------------------------------------------------- |
| `original`             | `string`     | —       | Complete original file content. Split internally by `\n`. |
| `edits`                | `DiffEdit[]` | —       | Line-range edits referencing indices in `original`.       |
| `lang`                 | `string`     | —       | Shiki language name for both sides.                       |
| `title`                | `string`     | —       | File path / title at the top. May contain ANSI.           |
| `context`              | `number`     | `3`     | Lines of surrounding context per hunk.                    |
| `width`, `fg`, `bg`, … | —            | —       | [`text`](./text) style fields flow through.               |

## `DiffEdit`

```ts
interface DiffEdit {
  from: number // inclusive
  to: number // exclusive
  replacement: string[] // new lines for [from, to)
}
```

- Pure insertion: `from === to`.
- Pure deletion: `replacement.length === 0`.
- `[from, to)` is half-open, matching the shape tool calls emit once their `old_string` / `new_string` has been resolved to a location.

## Notes

- Themed via `diffAdd`, `diffDel`, `diffContext`, `diffLine`, `diffTitle` — override these theme slots to restyle the whole diff look.
- Syntax highlighting is applied per-line, then the add/del backdrop is layered on top — shiki's per-token fg shows through.
