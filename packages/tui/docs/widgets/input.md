# input

Multi-line text input with auto-grow. The editing model lives in `this.actions` — editing commands are named actions the input router maps keys to, so users customize bindings without patching the class.

## Example

```ts
import { input } from "@zaly/tui"

input({ placeholder: "type a message…" })
  .focus()
  .on("submit", (value, self) => {
    console.log("got:", value)
    self.setState({ cursor: 0, value: "" })
  })
  .on("attach", (att) => {
    console.log("pasted a", att.kind, "at", att.path)
  })
```

## State

| field             | type     | default      | description                                                                 |
| ----------------- | -------- | ------------ | --------------------------------------------------------------------------- |
| `value`           | `string` | `""`         | Current text. May include `\n` for multi-line input.                        |
| `placeholder`     | `string` | —            | Dim fallback shown when `value` is empty.                                   |
| `cursor`          | `number` | end of value | Cursor position as a char index in `value`. Clamped to `[0, value.length]`. |
| `width`           | `Size`   | `"fill"`     | Render width.                                                               |
| `fg`, `bg`, attrs | —        | theme        | Ambient style.                                                              |

## Events

| event    | payload           | when                                                                                                                                 |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `submit` | `string`          | Plain `Enter` pressed (not `Shift-Enter`).                                                                                           |
| `attach` | `InputAttachment` | User pasted a non-text resource via `input.paste`. Discriminated by `attachment.kind`: `"image"` (temp PNG) or `"file"` (real path). |

## Actions

All editing commands live on `this.actions` and are routed by default keymaps. See [Input & actions](../guide/input) for the keymap layer.

| id                                              | default keys                        | description                                                           |
| ----------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| `input.submit`                                  | `enter`                             | Emit `submit` with the current value.                                 |
| `input.insertNewline`                           | `shift-enter`, `alt-enter`          | Newline at cursor, with smart indent.                                 |
| `input.insertTab`                               | `tab`                               | Insert two spaces.                                                    |
| `input.deleteCharBack`                          | `backspace`                         |                                                                       |
| `input.deleteCharForward`                       | `delete`                            |                                                                       |
| `input.deleteWordBack`                          | `ctrl-w`                            |                                                                       |
| `input.cursorLeft` / `input.cursorRight`        | `left` / `right`                    |                                                                       |
| `input.cursorUp` / `input.cursorDown`           | `up` / `down`                       | Column-preserving.                                                    |
| `input.cursorLineStart` / `input.cursorLineEnd` | `home` / `end`, `ctrl-a` / `ctrl-e` |                                                                       |
| `input.paste`                                   | `ctrl-v`                            | OS clipboard — text goes inline; images/files become `attach` events. |

## Notes

- Each keystroke batches its state writes via `setState`, so autocomplete and other `invalidate` listeners see exactly one signal per user action.
- Multi-line paste works cleanly — pasted `\n` characters pass through to `value` unchanged.

> [!TIP]
> Wire an [`autocomplete`](./autocomplete) directly above the input in your UI footer — its popup height auto-adjusts the UI surface.
