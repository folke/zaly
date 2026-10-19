import type { ShikiSelection } from "@zaly/tui"
import type { App } from "../src/app/app.ts"

import { expect, test, vi } from "vitest"
import { editConfig } from "../src/app/config.ts"

type Item = { prop?: string[]; toggle?: () => Promise<void>; id?: string }

function setup(initial: ShikiSelection, selected?: ShikiSelection) {
  const set = vi.fn()
  const reload = vi.fn()
  const pick = vi.fn(async (opts: { title: string; items: Item[]; active?: number }) => {
    if (opts.title === "Shiki Theme") {
      expect(opts.items[0]?.id).toBe("auto")
      expect(opts.items.some((item) => item.id === "github-dark")).toBe(true)
      expect(opts.items[opts.active!]?.id).toBe(initial)
      return opts.items.find((item) => item.id === selected)
    }
    const configItem = opts.items.find((item) => item.prop?.join(".") === "ui.shiki")
    expect(configItem).toBeDefined()
    await configItem!.toggle!()
    return undefined
  })
  const app = {
    $: { ui: { listHeight: 10 } },
    config: {
      user: {
        get: (prop: string[]) => (prop.join(".") === "ui.shiki" ? initial : undefined),
        set,
      },
    },
    notify: vi.fn(),
    pick,
    reload,
  }
  return { app: app as unknown as App, pick, reload, set }
}

test("config picker saves an explicit Shiki theme and reloads", async () => {
  const { app, pick, reload, set } = setup("auto", "github-dark")
  await editConfig(app)
  expect(pick).toHaveBeenCalledTimes(2)
  expect(set).toHaveBeenCalledTimes(1)
  expect(set).toHaveBeenCalledWith(["ui", "shiki"], "github-dark")
  expect(reload).toHaveBeenCalledTimes(1)
})

test("choosing auto clears the override", async () => {
  const { app, reload, set } = setup("github-dark", "auto")
  await editConfig(app)
  expect(set).toHaveBeenCalledTimes(1)
  expect(set).toHaveBeenCalledWith(["ui", "shiki"], undefined)
  expect(reload).toHaveBeenCalledTimes(1)
})

test("cancelling the Shiki picker leaves configuration unchanged", async () => {
  const { app, reload, set } = setup("github-dark")
  await editConfig(app)
  expect(set).not.toHaveBeenCalled()
  expect(reload).not.toHaveBeenCalled()
})
