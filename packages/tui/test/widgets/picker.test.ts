import type { RenderCtx } from "../../src/core/ctx.ts"
import type { PickerItem } from "../../src/widgets/picker.ts"
import type { TreeItem } from "../../src/widgets/tree.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { defaultTheme as theme } from "../../src/themes/registry.ts"
import { Input } from "../../src/widgets/input.ts"
import { picker } from "../../src/widgets/picker.ts"

const ctx: RenderCtx = createCtx({ theme, width: 60 })

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

async function settle(p: ReturnType<typeof picker>) {
  const items = p.state.items as { whenIdle?: () => Promise<void> }
  await items.whenIdle?.()
}

const items = (): PickerItem[] => [
  { text: "alpha", desc: "first" },
  { text: "beta", desc: "second" },
  { text: "alphabet", desc: "longer" },
]

describe("picker", () => {
  test("filters select items by pattern and marks more when limit is reached", async () => {
    const p = picker({ items: items(), limit: 1, pattern: "alp" })
    await settle(p)

    expect(p.count).toBe(1)
    expect(p.item?.text).toBe("alpha")
    expect(p.state.more).toBe(true)

    const rendered = await p.render(ctx)
    const rows = rendered.map(stripAnsi)
    expect(rows.join("\n")).toContain("alpha")
    expect(rows.join("\n")).not.toContain("beta")
  })

  test("picker.next and picker.prev jump between matches when filter is disabled", async () => {
    const p = picker({ filter: false, items: items(), pattern: "alp" })
    await settle(p)

    expect(p.count).toBe(3)
    expect(p.active).toBe(0)
    p.actions["picker.next"]()
    expect(p.item?.text).toBe("alphabet")
    p.actions["picker.next"]()
    expect(p.item?.text).toBe("alpha")
    p.actions["picker.prev"]()
    expect(p.item?.text).toBe("alphabet")
  })

  test("reverse picker navigation walks matching indexes backwards", async () => {
    const p = picker({ filter: false, items: items(), pattern: "alp", reverse: true })
    await settle(p)

    p.actions["picker.next"]()
    expect(p.item?.text).toBe("alphabet")
    p.actions["picker.prev"]()
    expect(p.item?.text).toBe("alpha")
  })

  test("falls back to select navigation when there are no matches", async () => {
    const p = picker({ filter: false, items: items(), pattern: "zzz" })
    await settle(p)

    expect(p.active).toBe(0)
    p.actions["picker.next"]()
    expect(p.active).toBe(1)
    p.actions["picker.prev"]()
    expect(p.active).toBe(0)
  })

  test("uses input state as the search pattern and binds action targets", async () => {
    const input = new Input({ value: "alp" })
    const p = picker({ input, items: items() })
    await settle(p)

    expect(p.count).toBe(2)
    const add = vi.spyOn(input, "addActionTarget")
    await p.emit("mount")
    expect(add).toHaveBeenCalledWith(p)
  })

  test("tree mode disables filtering and flattens tree items", async () => {
    const root: TreeItem = {
      text: "root",
      children: [{ text: "src", children: [{ text: "alpha.ts" }] }, { text: "beta.ts" }],
    }
    const p = picker({ pattern: "alpha", tree: root })
    await settle(p)

    expect(p.count).toBe(3)
    expect(p.state.more).toBe(false)
    const stateItems = p.state.items as unknown as () => PickerItem[]
    expect(stateItems().map((item) => item.text)).toEqual(["src", "alpha.ts", "beta.ts"])
  })

  test("custom actions are preserved", () => {
    const fn = vi.fn()
    const p = picker({ actions: { custom: fn }, items: items() })
    const actions = p.actions as Record<string, () => void>
    actions.custom()
    expect(fn).toHaveBeenCalled()
  })
})
