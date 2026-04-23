# code

Standalone syntax-highlighted code block with an optional title.

## Example

```ts
import { code } from "@zaly/tui"

code({ code: "const x = 1", lang: "typescript" })

code({
  code: "export function greet(name: string) {\n  return `hi ${name}`\n}",
  lang: "typescript",
  title: "src/greet.ts",
})
```

## State

| field     | type      | default | description |
|-----------|-----------|---------|-------------|
| `code`    | `string`  | —       | Source to render. |
| `lang`    | `string`  | —       | Any shiki-bundled language name (`typescript`, `python`, `bash`, …). |
| `title`   | `string`  | —       | Title line shown above the block. May contain ANSI. |
| `syntax`  | `boolean` | `true`  | Set `false` to disable highlighting even when `lang` is set. |
| `width`, `wrap`, `fg`, `bg`, … | — | — | All [`text`](./text) style fields flow through. |

## Notes

- Uses the `code` and `codeTitle` theme slots for ambient styling (backdrop + title). These are independent of the `mdCodeBlock` / `mdCodeBlockTitle` slots used when the same block appears inside a [`markdown`](./markdown) tree.
- Unknown or missing `lang` falls through to plain rendering — the backdrop still applies, so blocks always look framed.

> [!TIP]
> Shiki's grammar + theme loading is async but cached. First render of a new language takes a beat; subsequent ones are sync.
