import { randomHash } from "@zaly/shared"
import { mkdtempSync } from "node:fs"
import { rm, stat, utimes } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  Session,
  listSessions,
  loadSession,
  resumeSession,
} from "../src/session/index.ts"

// Redirect ZALY_ROOT to a per-suite tmpdir so tests can never touch the
// real ~/.zaly/. The whole tree gets nuked in afterAll regardless of
// workspace names, so we don't need per-test prefix tracking.
let testRoot: string
let prevRoot: string | undefined

beforeAll(() => {
  testRoot = mkdtempSync(join(tmpdir(), "zaly-test-"))
  prevRoot = process.env.ZALY_ROOT
  process.env.ZALY_ROOT = testRoot
})

afterAll(async () => {
  if (prevRoot === undefined) delete process.env.ZALY_ROOT
  else process.env.ZALY_ROOT = prevRoot
  await rm(testRoot, { force: true, recursive: true })
})

/** Generate a unique workspace path per test so concurrent tests don't
 *  collide within the suite. */
function testWorkspace(label: string): string {
  return join(testRoot, "ws", `${label}-${randomHash(6)}`)
}

describe("loadSession (create)", () => {
  test("derives dir/path/workspace/id from workspace", async () => {
    const workspace = testWorkspace("create")
    const session = await loadSession({ workspace })
    expect(session).toBeInstanceOf(Session)
    expect(session.id).toBeDefined()
    expect(session.dir).toContain(session.id)
    await session.close()
  })

  test("uses provided id when given", async () => {
    const workspace = testWorkspace("create-id")
    const id = `pinned-${randomHash(6)}`
    const session = await loadSession({ id, workspace })
    expect(session.id).toBe(id)
    expect(session.dir.endsWith(`/${id}`)).toBe(true)
    await session.close()
  })

  test("defaults workspace to process.cwd() when not given", async () => {
    const session = await loadSession()
    expect(session.id).toBeDefined()
    expect(session.dir).toContain(session.id)
    await session.close()
  })

  test("creates the session directory on disk", async () => {
    const workspace = testWorkspace("dir-exists")
    const session = await loadSession({ workspace })
    const dirStat = await stat(session.dir)
    expect(dirStat.isDirectory()).toBe(true)
    await session.close()
  })
})

describe("listSessions", () => {
  test("returns empty array for a workspace with no sessions", async () => {
    const list = await listSessions({ filter: { workspace: testWorkspace("empty") } })
    expect(list).toEqual([])
  })

  test("lists sessions created in a workspace", async () => {
    const workspace = testWorkspace("list")
    const a = await loadSession({ workspace })
    const b = await loadSession({ workspace })
    await a.start()
    await b.start()
    await a.close()
    await b.close()

    const list = await listSessions({ filter: { workspace } })
    expect(list).toHaveLength(2)
    const ids = list.map((s) => s.id).toSorted()
    expect(ids).toEqual([a.id, b.id].toSorted())
    for (const s of list) {
      expect(s.workspace).toBe(workspace)
      expect(s.path).toBe(join(s.dir, "session.jsonl"))
    }
  })

  test("filters by id when provided", async () => {
    const workspace = testWorkspace("list-by-id")
    const a = await loadSession({ workspace })
    const b = await loadSession({ workspace })
    await a.start()
    await b.start()
    await a.close()
    await b.close()

    const list = await listSessions({ filter: { id: a.id, workspace } })
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(a.id)
  })

  test("sort: true orders by mtime, newest first", async () => {
    const workspace = testWorkspace("sort")
    const a = await loadSession({ workspace })
    await a.start()
    await a.close()
    const b = await loadSession({ workspace })
    await b.start()
    await b.close()

    // Force `b` to be older than `a` so the sort actually reorders.
    const oldTime = Date.now() / 1000 - 60
    await utimes(b.path!, oldTime, oldTime)

    const list = await listSessions({ filter: { workspace }, sort: true })
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe(a.id) // newest first
    expect(list[1].id).toBe(b.id)
    expect(list[0].mtime).toBeGreaterThan(list[1].mtime!)
  })

  test("sort: true populates mtime on returned entries", async () => {
    const workspace = testWorkspace("sort-mtime")
    const a = await loadSession({ workspace })
    await a.start()
    await a.close()

    const list = await listSessions({ filter: { workspace }, sort: true })
    expect(list).toHaveLength(1)
    expect(list[0].mtime).toBeDefined()
  })
})

describe("resumeSession", () => {
  test("returns undefined when no sessions exist", async () => {
    const result = await resumeSession({ workspace: testWorkspace("resume-empty") })
    expect(result).toBeUndefined()
  })

  test("returns the latest session by mtime", async () => {
    const workspace = testWorkspace("resume")
    const oldSession = await loadSession({ workspace })
    await oldSession.start()
    await oldSession.close()
    const newSession = await loadSession({ workspace })
    await newSession.start()
    await newSession.close()

    // Force oldSession to be older.
    const oldTime = Date.now() / 1000 - 60
    await utimes(oldSession.path!, oldTime, oldTime)

    const resumed = await resumeSession({ workspace })
    expect(resumed).toBeDefined()
    expect(resumed!.id).toBe(newSession.id)
    await resumed?.close()
  })

  test("returns single session without sorting overhead", async () => {
    const workspace = testWorkspace("resume-single")
    const only = await loadSession({ workspace })
    await only.start()
    await only.close()

    const resumed = await resumeSession({ workspace })
    expect(resumed).toBeDefined()
    expect(resumed!.id).toBe(only.id)
    await resumed?.close()
  })

  test("hydrates the session's prior state", async () => {
    const workspace = testWorkspace("resume-hydrate")
    const original = await loadSession({ workspace })
    await original.start({ modelId: "openai/gpt-4o" })
    await original.add({ content: "hi", role: "user" })
    await original.add({ content: "hello", role: "assistant" })
    await original.close()

    const resumed = await resumeSession({ workspace })
    expect(resumed).toBeDefined()
    expect(resumed!.id).toBe(original.id)
    expect(resumed!.settings.modelId).toBe("openai/gpt-4o")
    expect(resumed!.messages.map((m) => m.content)).toEqual(["hi", "hello"])
    await resumed?.close()
  })
})

describe("create + list + resume round-trip", () => {
  test("created sessions show up in list and can be resumed", async () => {
    const workspace = testWorkspace("roundtrip")
    const created = await loadSession({ workspace })
    await created.start({ modelId: "anthropic/claude" })
    await created.add({ content: "test message", role: "user" })
    await created.close()

    // Visible in list
    const listed = await listSessions({ filter: { workspace } })
    expect(listed.map((s) => s.id)).toContain(created.id)

    // Resumable by path
    const found = listed.find((s) => s.id === created.id)
    expect(found).toBeDefined()
    const reopened = await Session.load({ path: found!.path })
    expect(reopened.id).toBe(created.id)
    expect(reopened.settings.modelId).toBe("anthropic/claude")
    await reopened.close()

    // Resumable via resumeSession (only one session in this test workspace)
    const resumed = await resumeSession({ workspace })
    expect(resumed!.id).toBe(created.id)
    await resumed?.close()
  })
})
