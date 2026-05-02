import { describe, expect, test } from "vitest"
import { isSSH, which } from "../src/index.ts"
import { Spawn, spawnText, spawnWithInput } from "../src/process/spawn.ts"

describe("Spawn — basics", () => {
  test("buffers stdout and resolves with exit code 0", async () => {
    const r = await new Spawn("printf", ["hello"]).result
    expect(r.code).toBe(0)
    expect(r.stdout.toString()).toBe("hello")
    expect(r.stderr.toString()).toBe("")
    expect(r.killed).toBe(false)
  })

  test("non-zero exit is not an error — surfaces the code", async () => {
    const r = await new Spawn("sh", ["-c", "exit 7"]).result
    expect(r.code).toBe(7)
    expect(r.killed).toBe(false)
  })

  test("captures stderr separately and combined preserves order", async () => {
    const r = await new Spawn("sh", ["-c", "printf out; printf err 1>&2"]).result
    expect(r.stdout.toString()).toBe("out")
    expect(r.stderr.toString()).toBe("err")
  })

  test("memoised result promise — repeat awaits return the same value", async () => {
    const p = new Spawn("printf", ["x"])
    const a = await p.result
    const b = await p.result
    expect(a).toBe(b)
  })

  test("rejects with spawn error for unknown commands", async () => {
    await expect(new Spawn("__definitely_not_a_real_binary__").result).rejects.toThrow()
  })

  test("piped stdin is forwarded to the child", async () => {
    const r = await new Spawn("cat", [], { stdin: "piped-input" }).result
    expect(r.stdout.toString()).toBe("piped-input")
  })

  test("aborts when the AbortSignal fires before spawn", () => {
    const ac = new AbortController()
    ac.abort()
    expect(() => new Spawn("printf", ["x"], { signal: ac.signal })).toThrow(/abort/i)
  })

  test("timeout terminates a long-running process", async () => {
    const p = new Spawn("sleep", ["5"], { timeout: 50 })
    const r = await p.result
    expect(r.killed).toBe(true)
    expect(r.killReason).toBe("timeout")
  })

  test("AbortSignal terminates a running process", async () => {
    const ac = new AbortController()
    const p = new Spawn("sleep", ["5"], { signal: ac.signal })
    setTimeout(() => ac.abort(), 20)
    const r = await p.result
    expect(r.killed).toBe(true)
    expect(r.killReason).toBe("abort")
  })

  test("maxBuffer overflow kills the process", async () => {
    const p = new Spawn("sh", ["-c", "yes | head -c 4096"], { maxBuffer: 100 })
    const r = await p.result
    expect(r.killed).toBe(true)
    expect(r.killReason).toBe("maxBuffer")
  })

  test("manual kill records killReason 'manual'", async () => {
    const p = new Spawn("sleep", ["5"])
    setTimeout(() => p.kill(), 20)
    const r = await p.result
    expect(r.killed).toBe(true)
    expect(r.killReason).toBe("manual")
  })

  test("first kill reason wins (timeout beats subsequent manual)", async () => {
    const p = new Spawn("sleep", ["5"], { timeout: 30 })
    setTimeout(() => p.kill(), 60)
    const r = await p.result
    expect(r.killReason).toBe("timeout")
  })
})

describe("Spawn — streaming", () => {
  test("stream() yields chunks then a single exit event", async () => {
    const p = new Spawn("sh", ["-c", "printf a; printf b 1>&2; exit 0"])
    const events: string[] = []
    for await (const ev of p.stream()) {
      if (ev.type === "stdout") events.push(`out:${ev.data.toString()}`)
      else if (ev.type === "stderr") events.push(`err:${ev.data.toString()}`)
      else events.push(`exit:${ev.code}`)
    }
    expect(events.filter((e) => e.startsWith("out:")).join("")).toBe("out:a")
    expect(events.filter((e) => e.startsWith("err:")).join("")).toBe("err:b")
    expect(events.at(-1)).toBe("exit:0")
  })

  test("late subscribers still receive the exit event", async () => {
    const p = new Spawn("printf", ["done"])
    await p.result
    const events = []
    for await (const ev of p.stream()) events.push(ev.type)
    expect(events).toEqual(["exit"])
  })

  test("multiple concurrent subscribers each see the exit event", async () => {
    const p = new Spawn("sh", ["-c", "printf x"])
    const collect = async () => {
      const evs = []
      for await (const ev of p.stream()) evs.push(ev.type)
      return evs
    }
    const [a, b] = await Promise.all([collect(), collect()])
    expect(a.at(-1)).toBe("exit")
    expect(b.at(-1)).toBe("exit")
  })
})

describe("Spawn — write/closeStdin", () => {
  test("write appends to stdin while keepStdinOpen", async () => {
    const p = new Spawn("cat", [], { keepStdinOpen: true })
    p.write("hello ")
    p.write("world")
    p.closeStdin()
    const r = await p.result
    expect(r.stdout.toString()).toBe("hello world")
  })
})

describe("spawnText", () => {
  test("returns stdout text on exit 0", async () => {
    expect(await spawnText("printf", ["hi"])).toBe("hi")
  })
  test("returns undefined on non-zero exit", async () => {
    expect(await spawnText("sh", ["-c", "printf x; exit 1"])).toBeUndefined()
  })
  test("returns undefined on empty stdout", async () => {
    expect(await spawnText("true")).toBeUndefined()
  })
  test("returns undefined when binary is missing", async () => {
    expect(await spawnText("__definitely_not_a_real_binary__")).toBeUndefined()
  })
})

describe("spawnWithInput", () => {
  test("true on exit 0 with stdin piped", async () => {
    expect(await spawnWithInput("cat", [], "x")).toBe(true)
  })
  test("false on non-zero exit", async () => {
    expect(await spawnWithInput("sh", ["-c", "exit 2"], "")).toBe(false)
  })
  test("false on missing binary", async () => {
    expect(await spawnWithInput("__definitely_not_a_real_binary__", [], "")).toBe(false)
  })
})

describe("which", () => {
  test("finds a binary that's on PATH", () => {
    const p = which("sh")
    expect(p).toBeDefined()
    expect(p).toMatch(/sh$/)
  })
  test("returns undefined for a missing command", () => {
    expect(which("__definitely_not_a_real_binary__")).toBeUndefined()
  })
  test("absolute path fast-path returns the path when executable", () => {
    const sh = which("sh") as string
    expect(which(sh)).toBe(sh)
  })
  test("absolute path fast-path returns undefined for non-executable paths", () => {
    expect(which("/this/path/does/not/exist")).toBeUndefined()
  })
})

describe("isSSH", () => {
  test("returns a boolean reflecting SSH_* env vars", () => {
    const before = process.env.SSH_TTY
    delete process.env.SSH_TTY
    delete process.env.SSH_CONNECTION
    delete process.env.SSH_CLIENT
    try {
      expect(isSSH()).toBe(false)
      process.env.SSH_TTY = "/dev/pts/0"
      expect(isSSH()).toBe(true)
    } finally {
      delete process.env.SSH_TTY
      if (before !== undefined) process.env.SSH_TTY = before
    }
  })
})
