import { describe, expect, test, vi } from "vitest"
import { Actions } from "../../../src/input/actions.ts"
import { actionsSource } from "../../../src/widgets/completions/actions.ts"
import { fuzzyScore } from "../../../src/widgets/completions/fuzzy.ts"

const match = (q: string) => (s: string) => fuzzyScore(q, s)

describe("actionsSource", () => {
  test("emits raw ActionInfo + id items from the registry", async () => {
    const actions = new Actions()
    actions.register({
      "app.commit": { desc: "commit changes", cmd: "commit" },
      "app.quit": { desc: "quit the app", cmd: "quit" },
    })
    const src = actionsSource({ actions })
    const items = await src.complete("", match(""))
    expect(items.map((i) => i.id)).toContain("app.commit")
    const commit = items.find((i) => i.id === "app.commit")!
    expect(commit.cmd).toBe("commit")
    expect(commit.desc).toBe("commit changes")
    expect(commit.value).toBe("commit")
  })

  test("fuzzy-matches the displayed name", async () => {
    const actions = new Actions()
    actions.register({
      "app.commit": { cmd: "commit" },
      "app.quit": { cmd: "quit" },
      "app.restart": { cmd: "restart" },
    })
    const src = actionsSource({ actions })
    const items = await src.complete("qt", match("qt"))
    expect(items.map((i) => i.cmd)).toEqual(["quit"])
  })

  test("filter excludes entries (default skips hidden)", async () => {
    const actions = new Actions()
    actions.register({
      "app.quit": { hidden: true, cmd: "quit" },
      "app.visible": { cmd: "visible" },
    })
    const src = actionsSource({ actions })
    const items = await src.complete("", match(""))
    expect(items.map((i) => i.cmd)).toEqual(["visible"])
  })

  test("accept dispatches the action via the registry and returns undefined", () => {
    const actions = new Actions()
    const fn = vi.fn()
    actions.register({ "app.quit": { fn, cmd: "quit" } })
    const src = actionsSource({ actions })
    const item = { id: "app.quit", name: "quit", value: "quit" }
    const result = src.accept!(item, "quit")
    expect(result).toBeUndefined()
    expect(fn).toHaveBeenCalled()
  })

  test("default trigger matches a leading slash", () => {
    const actions = new Actions()
    const src = actionsSource({ actions })
    expect(src.triggers[0].test("/x")).toBe(true)
    expect(src.triggers[0].test("  /x")).toBe(true)
    expect(src.triggers[0].test("hello /x")).toBe(false)
  })
})
