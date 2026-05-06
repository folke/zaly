# Input & actions

The input layer separates three concerns:

- **Actions** — named intents (`input.cursorLeft`, `menu.next`, `global.quit`). Each registered with a `desc`, optional default keys, and an optional handler.
- **Keymap** — key pattern → action id(s). Multiple actions can share a key; dispatch tries each in order until one consumes.
- **Focus chain** — `renderer.input.focus(node)` / `node.focus()`. The focused node is where key events land; action dispatch walks up from there looking for a handler.

The separation means users rebind keys without patching the widgets that provide the actions.

## Dispatch phases

A key event flows through three phases:

```
phase 1 — per-node "key" bubble on the focus chain
phase 2 — keymap lookup → actions.dispatch
phase 3 — router.bind() globals
```

Any phase can mark the event consumed via `ev.stop()`. Phase 1 is where widgets intercept raw keys (autocomplete's arrow-key takeover, for example). Phase 2 is the mainline path — most bindings live here. Phase 3 catches the rest.

## Authoring actions on a widget

```ts
class MyWidget extends Node {
  override actions = {
    "my.do": (): void => {
      /* ... */
    },
    "my.undo": {
      desc: "undo last action",
      keys: ["ctrl-z"],
      fn: (): void => {
        /* ... */
      },
    },
  }
}
```

Two forms:

- **Bare function** — just the handler. Used when metadata already lives in `defaultActions` (bundled widgets use this for `input.*`, `menu.*`).
- **Object form** — `{ desc, keys, fn }`. On mount, the metadata (everything except `fn`) is auto-registered into `ctx.actions` with `extend: false`, so it contributes defaults without clobbering anything the user already configured.

## App-level actions

Register from outside a widget:

```ts
renderer.actions.register({
  "app.commit": {
    name: "commit",
    desc: "commit changes",
    keys: ["ctrl-s"],
    fn: (ctx) => {
      /* ... */
    },
  },
})
```

- `name` — optional display name (used by [`actionsSource`](../widgets/autocomplete) for `/commit`-style completion).
- `desc` — help-screen / command-palette copy.
- `keys` — default key bindings. The router rebuilds its keymap when the catalog changes.
- `fn` — handler. When present, `dispatch(id)` calls it directly (global action). When absent, dispatch walks the focus chain looking for a node with `actions[id]`.

Dispatch programmatically:

```ts
renderer.actions.dispatch("app.commit")
```

Returns `true` when something handled it, `false` otherwise.

## Global key bindings

For quick one-offs where a named action would be overkill:

```ts
const unbind = renderer.bind("ctrl-s", () => {
  save()
  return true // consume
})
```

Fires after focused-node listeners and keymap actions. Returning `true` marks the event consumed. Call the returned `unbind()` to detach.

## Keymaps

Action `.keys` entries are the single source of truth for default bindings — the registry builds the router's keymap from them. To override, configure per-action:

```ts
renderer.actions.register({ "my.undo": { keys: ["ctrl-z"] } })
```

The registry's `onChange` hook rebuilds the router's keymap index.

## Clipboard

Most terminals don't forward clipboard paste events to apps — they only forward typed keys. So on `ctrl-v`, the [`input`](../widgets/input) widget's `input.paste` action queries the OS clipboard directly via the platform's native tool.

The `clipboard` module exposes the same capability for app-level use.

```ts
import { clipboard } from "@zaly/tui"

// Read the richest content the OS has. Returns undefined when the
// clipboard isn't reachable.
const content = await clipboard.read()
if (content?.kind === "text") console.log(content.text)
if (content?.kind === "image") console.log("image at", content.path)
if (content?.kind === "files") console.log("files:", content.paths)

// Or narrow the probe to one kind — useful when you only care about text.
const text = await clipboard.read("text")

// Write plain text back.
clipboard.write("hello")

// Clear the cached provider (useful after changing sessions).
clipboard.reset()
```

### Content shape

`clipboard.read()` returns a discriminated union so listeners can pattern-match without parsing MIME strings:

| kind    | payload                               | notes                                                           |
| ------- | ------------------------------------- | --------------------------------------------------------------- |
| `text`  | `{ text: string }`                    | The common case.                                                |
| `image` | `{ path: string, type: "image/png" }` | Image bytes written to a temp PNG — the caller takes ownership. |
| `files` | `{ paths: string[] }`                 | Real filesystem paths, e.g. from a file manager copy.           |

### Provider detection

The detection order mirrors Neovim's clipboard provider:

1. **macOS** → `pbpaste` + `osascript` (image probe).
2. **Wayland** → `wl-paste`.
3. **X11** → `xsel`, falling back to `xclip`.
4. **WSL** → `win32yank.exe` (if installed).
5. **Windows** → PowerShell `Get-Clipboard`.

The chosen provider is cached per process. `clipboard.reset()` clears the cache.

### SSH and OSC 52

Under SSH, `clipboard.write(text)` uses **OSC 52** instead of a native tool so the write routes through the user's local terminal — otherwise you'd be writing to the remote box's clipboard, which isn't what the user wants.

> [!NOTE]
> OSC 52 is fire-and-forget. Some terminals gate it behind a prompt or disable it entirely (Neovim disables it outside SSH by default for the same reason). `@zaly/tui` only engages OSC 52 when running under SSH.

### Input attachments

When the clipboard holds an image or file references, the [`input`](../widgets/input) widget's `input.paste` action doesn't try to stuff binary data into the buffer. Instead it emits an `attach` event with a discriminated payload — listeners decide how to handle it (upload, embed, render inline, …):

```ts
input({ placeholder: "…" }).on("attach", (att) => {
  if (att.kind === "image") stream.append(image(att.path))
  if (att.kind === "file") stream.append(markdown(`*attached:* \`${att.path}\``))
})
```

Plain text pastes get inlined at the cursor as usual.

## See also

- [Autocomplete](../widgets/autocomplete) — builds on the action registry for slash-command completion.
- [Input widget](../widgets/input) — the text input whose editing commands live in this system.
