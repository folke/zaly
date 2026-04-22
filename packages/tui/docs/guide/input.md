# Input & actions

> TODO: expand this page.

The input layer separates three concerns cleanly:

- **Actions** — named intents, registered in the `Actions` registry. Example: `input.cursorLeft`, `menu.next`, `global.quit`.
- **Keymaps** — key pattern → action id(s). Multiple actions can share a key; dispatch tries each in order.
- **Focus chain** — `renderer.input.focus(node)` / `node.focus()`. Actions that don't have a catalog-level `fn` walk from the focus chain upward to find a `node.actions[id]` handler.

## Dispatching by key

```text
phase 1: per-node "key" bubble on the focus chain
phase 2: keymap lookup → actions.dispatch
phase 3: router.bind() globals
```

Each phase can stop propagation via `ev.stop()`.

## Global bindings

```ts
renderer.bind("ctrl-s", () => {
  save()
  return true
})
```

Fires after focused-node listeners and keymap actions. Returning `true` marks the event consumed.

## Authoring actions on a widget

```ts
class MyWidget extends Node {
  override actions = {
    "my.do": (): void => { /* ... */ },
    "my.undo": {
      desc: "undo last action",
      keys: ["ctrl-z"],
      fn: (): void => { /* ... */ },
    },
  }
}
```

The second form auto-registers metadata + default key bindings into the catalog on mount.
